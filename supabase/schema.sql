-- Extrator SysLoja Web: tabelas com RLS (sem políticas) + funções protegidas por segredo.
-- O acesso vem só do servidor (Vercel), que conhece o segredo.

create extension if not exists pgcrypto;

create table if not exists ext_config (chave text primary key, valor text not null);

create table if not exists ext_extracoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  banco text not null,
  maquina text,
  versao_agente text,
  status text not null default 'recebendo', -- recebendo | pronta | validada | com_erro
  resumo jsonb not null default '{}'::jsonb
);

create table if not exists ext_partes (
  extracao_id uuid not null references ext_extracoes(id) on delete cascade,
  modulo text not null,
  parte int not null,
  linhas int not null default 0,
  dados text not null, -- JSON compactado (gzip) em base64
  primary key (extracao_id, modulo, parte)
);

create table if not exists ext_regras (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  modulo text not null,
  nome text not null,
  descricao text,
  regra jsonb not null,
  status text not null default 'ativa', -- ativa | pendente | desativada
  origem text not null default 'ia', -- ia | manual
  acertos int not null default 0,
  falhas int not null default 0,
  feedback_id uuid
);

create table if not exists ext_feedbacks (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  extracao_id uuid references ext_extracoes(id) on delete set null,
  modulo text,
  tipo text not null, -- ok | erro
  log text,
  diagnostico jsonb,
  regras_aplicadas jsonb not null default '[]'::jsonb,
  regras_criadas jsonb not null default '[]'::jsonb
);

alter table ext_config enable row level security;
alter table ext_extracoes enable row level security;
alter table ext_partes enable row level security;
alter table ext_regras enable row level security;
alter table ext_feedbacks enable row level security;

create or replace function ext_checar(p_segredo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_segredo is null or p_segredo <> (select valor from ext_config where chave = 'segredo') then
    raise exception 'acesso negado' using errcode = '28000';
  end if;
end $$;

create or replace function ext_criar_extracao(p_segredo text, p_banco text, p_maquina text, p_versao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform ext_checar(p_segredo);
  insert into ext_extracoes (banco, maquina, versao_agente) values (p_banco, p_maquina, p_versao)
  returning id into v_id;
  return v_id;
end $$;

create or replace function ext_salvar_parte(p_segredo text, p_extracao uuid, p_modulo text, p_parte int, p_linhas int, p_dados text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  insert into ext_partes (extracao_id, modulo, parte, linhas, dados)
  values (p_extracao, p_modulo, p_parte, p_linhas, p_dados)
  on conflict (extracao_id, modulo, parte) do update set linhas = excluded.linhas, dados = excluded.dados;
end $$;

create or replace function ext_concluir_extracao(p_segredo text, p_extracao uuid, p_resumo jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  update ext_extracoes set status = 'pronta', resumo = coalesce(p_resumo, '{}'::jsonb) where id = p_extracao;
  -- guarda os dados só das 30 extrações mais recentes (o histórico continua)
  delete from ext_partes where extracao_id in (
    select id from ext_extracoes order by criado_em desc offset 30
  );
end $$;

create or replace function ext_listar_extracoes(p_segredo text, p_limite int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em desc) from (
    select x.*, (select count(*) from ext_feedbacks f where f.extracao_id = x.id) as feedbacks
    from ext_extracoes x order by x.criado_em desc limit p_limite) e), '[]'::jsonb);
end $$;

create or replace function ext_obter_extracao(p_segredo text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  return (select to_jsonb(e) || jsonb_build_object(
      'partes', coalesce((select jsonb_agg(jsonb_build_object('modulo', p.modulo, 'parte', p.parte, 'linhas', p.linhas)
                 order by p.modulo, p.parte) from ext_partes p where p.extracao_id = e.id), '[]'::jsonb),
      'feedbacks', coalesce((select jsonb_agg(to_jsonb(f) - 'log' order by f.criado_em desc)
                 from ext_feedbacks f where f.extracao_id = e.id), '[]'::jsonb))
    from ext_extracoes e where e.id = p_id);
end $$;

create or replace function ext_obter_parte(p_segredo text, p_id uuid, p_modulo text, p_parte int)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  return (select dados from ext_partes where extracao_id = p_id and modulo = p_modulo and parte = p_parte);
end $$;

create or replace function ext_listar_regras(p_segredo text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.criado_em) from ext_regras r), '[]'::jsonb);
end $$;

create or replace function ext_salvar_regra(p_segredo text, p_regra jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform ext_checar(p_segredo);
  if p_regra ? 'id' and (p_regra->>'id') is not null then
    update ext_regras set
      nome = coalesce(p_regra->>'nome', nome),
      descricao = coalesce(p_regra->>'descricao', descricao),
      regra = coalesce(p_regra->'regra', regra),
      status = coalesce(p_regra->>'status', status),
      modulo = coalesce(p_regra->>'modulo', modulo),
      atualizado_em = now()
    where id = (p_regra->>'id')::uuid returning id into v_id;
  else
    insert into ext_regras (modulo, nome, descricao, regra, status, origem, feedback_id)
    values (p_regra->>'modulo', p_regra->>'nome', p_regra->>'descricao', p_regra->'regra',
            coalesce(p_regra->>'status', 'ativa'), coalesce(p_regra->>'origem', 'ia'),
            nullif(p_regra->>'feedback_id', '')::uuid)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function ext_excluir_regra(p_segredo text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  delete from ext_regras where id = p_id;
end $$;

create or replace function ext_registrar_feedback(p_segredo text, p_fb jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ext uuid := nullif(p_fb->>'extracao_id', '')::uuid;
begin
  perform ext_checar(p_segredo);
  insert into ext_feedbacks (extracao_id, modulo, tipo, log, diagnostico, regras_aplicadas, regras_criadas)
  values (v_ext, p_fb->>'modulo', p_fb->>'tipo', p_fb->>'log', p_fb->'diagnostico',
          coalesce(p_fb->'regras_aplicadas', '[]'::jsonb), coalesce(p_fb->'regras_criadas', '[]'::jsonb))
  returning id into v_id;
  -- aprendizado: importação ok reforça as regras usadas; erro conta falha
  if p_fb->>'tipo' = 'ok' then
    update ext_regras set acertos = acertos + 1
    where id::text in (select jsonb_array_elements_text(coalesce(p_fb->'regras_aplicadas', '[]'::jsonb)));
    if v_ext is not null then update ext_extracoes set status = 'validada' where id = v_ext; end if;
  else
    update ext_regras set falhas = falhas + 1
    where id::text in (select jsonb_array_elements_text(coalesce(p_fb->'regras_aplicadas', '[]'::jsonb)));
    if v_ext is not null then update ext_extracoes set status = 'com_erro' where id = v_ext; end if;
  end if;
  return v_id;
end $$;

create or replace function ext_atualizar_feedback(p_segredo text, p_id uuid, p_regras_criadas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  update ext_feedbacks set regras_criadas = p_regras_criadas where id = p_id;
end $$;

create or replace function ext_listar_feedbacks(p_segredo text, p_limite int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform ext_checar(p_segredo);
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.criado_em desc) from (
    select f.*, e.banco from ext_feedbacks f left join ext_extracoes e on e.id = f.extracao_id
    order by f.criado_em desc limit p_limite) f), '[]'::jsonb);
end $$;

revoke all on function ext_checar(text) from public, anon, authenticated;
