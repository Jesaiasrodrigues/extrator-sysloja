# Extrator SysLoja Web

Versão web do Conversor de banco (SysLoja → PCNET) com IA que aprende com os logs de erro da importação.

```
Máquina da loja                         Vercel                         Supabase
agente_web.py ──(token, gzip, 1000 linhas/parte)──► /api/agente/* ──► ext_* (RPC com segredo)
(usa exportar_produtos.py)              painel + regras + IA ◄──────── regras, feedbacks, extrações
                                        └─► Claude API (lê o log, propõe regras)
```

## Como funciona o aprendizado
1. O agente extrai o banco e envia. O painel aplica as **regras ativas** e gera a planilha de importação.
2. Importou sem erro → **✅** e as regras usadas ganham um acerto.
3. Deu erro → **❌**, envia o log. A IA recebe o log resumido em padrões, as estatísticas das colunas, as linhas citadas, as regras atuais e o histórico, e propõe **regras declarativas** (nada de código livre).
4. Você testa no painel, aprova e a regra passa a valer para todas as próximas extrações.

Regras: condições (`vazio`, `igual`, `em`, `regex`, `menor_igual`...) e ações (`definir`, `copiar`, `extrair`, `mapear`, `completar_zeros`, `pendencia`, `remover_linha`...). Veja `lib/regras.ts`.

## Publicar na Vercel
1. Suba esta pasta para um repositório no GitHub.
2. Vercel → Add New → Project → importe o repositório (framework Next.js).
3. Em Environment Variables, cole o conteúdo do arquivo `vercel.env` (entregue à parte, não vai para o Git) e acrescente `ANTHROPIC_API_KEY`.
4. Deploy.

| Variável | Para quê |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | projeto Supabase `extrator-sysloja` |
| `DB_SEGREDO` | libera as funções `ext_*` do banco (tabelas têm RLS sem política) |
| `AGENTE_TOKEN` | autentica o agente local |
| `APP_SENHA`, `SESSAO_SEGREDO` | login do painel |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | IA (padrão `claude-sonnet-5-5`) |

Banco: `supabase/schema.sql` (já aplicado). Guarda os dados das 30 extrações mais recentes.

## Agente local
Na pasta `SYSLOJA_EXTRAIR`: `agente_web.py`, `agente_web.bat` e `agente_config.json` (baixado no painel). Duplo clique no `.bat`.
Sem janela: `python agente_web.py --senha SENHA --banco BANCO [--copia-local]`.

## Testes
`npm test` (motor de regras e resumo de log) · `npm run build`.
