"""
Agente web do Conversor de banco (SysLoja).

Usa o mesmo exportar_produtos.py (mesma pasta) para ler o MySQL local e envia o resultado
para o painel web (Vercel). La ficam o painel, as regras aprendidas e a IA que le o log de
erro da importacao.

Arquivos na mesma pasta:
  exportar_produtos.py   -> o extrator (nao muda)
  agente_config.json     -> {"url": "https://...vercel.app", "token": "..."} (baixe no painel)
  agente_web.bat         -> atalho de duplo clique

Uso sem janela (agendador de tarefas):
  python agente_web.py --senha SENHA --banco NOME_DO_BANCO [--copia-local]
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import platform
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import date, datetime
from decimal import Decimal

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)

import exportar_produtos as ep

VERSAO = "1.0"
LINHAS_POR_PARTE = 1000
TENTATIVAS = 3


# ---------------- CONFIGURACAO ----------------
def ler_config() -> dict:
    caminho = os.path.join(PASTA, "agente_config.json")
    if not os.path.exists(caminho):
        raise RuntimeError(
            "Falta o agente_config.json nesta pasta.\nBaixe no painel web (pagina Extracoes)."
        )
    with open(caminho, encoding="utf-8") as arquivo:
        config = json.load(arquivo)
    if not config.get("url") or not config.get("token"):
        raise RuntimeError("agente_config.json sem url ou token.")
    config["url"] = config["url"].rstrip("/")
    return config


# ---------------- HTTP ----------------
def requisicao(
    config: dict,
    metodo: str,
    caminho: str,
    corpo: bytes | None = None,
    tipo: str = "application/json",
) -> dict:
    erro_final: Exception | None = None
    for tentativa in range(TENTATIVAS):
        pedido = urllib.request.Request(
            config["url"] + caminho,
            data=corpo,
            method=metodo,
            headers={
                "Authorization": f"Bearer {config['token']}",
                "Content-Type": tipo,
                "User-Agent": f"agente-sysloja/{VERSAO}",
            },
        )
        try:
            with urllib.request.urlopen(pedido, timeout=120) as resposta:
                texto = resposta.read().decode("utf-8") or "{}"
                return json.loads(texto)
        except urllib.error.HTTPError as erro:
            detalhe = erro.read().decode("utf-8", "replace")[:300]
            if erro.code in (400, 401, 403, 404):  # nao adianta repetir
                raise RuntimeError(
                    f"Servidor recusou ({erro.code}): {detalhe}"
                ) from erro
            erro_final = RuntimeError(f"Servidor ({erro.code}): {detalhe}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as erro:
            erro_final = RuntimeError(f"Sem conexao com {config['url']}: {erro}")
        time.sleep(2 * (tentativa + 1))
    raise erro_final or RuntimeError("falha desconhecida")


def enviar_json(config: dict, caminho: str, dados) -> dict:
    return requisicao(config, "POST", caminho, json.dumps(dados).encode("utf-8"))


# ---------------- CONVERSAO PARA JSON ----------------
def valor_json(valor):
    if valor is None:
        return None
    if isinstance(valor, bool):
        return "S" if valor else "N"
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (int, float)):
        return valor
    if isinstance(valor, (datetime, date)):
        return "@d:" + valor.isoformat()
    texto = ep.como_texto(valor)
    return texto if texto != "" else None


def linhas_do_modulo(chave: str, resultado) -> tuple[list[str], list[dict]]:
    """Mesmo conteudo das planilhas de importacao do extrator desktop."""
    if chave == "produtos":
        return ep.CABECALHO_PRODUTOS + [
            "INATIVO",
            "FISCAL",
            "PENDENCIAS",
        ], resultado.linhas
    if chave == "pessoas":
        return ep.CABECALHO_MODELO_PESSOAS, ep.pessoas_no_modelo(resultado.linhas)
    if chave == "contas":
        linhas = [
            {
                "Nome": l["NOME"],
                "Descrição": l["DESCRICAO"],
                "Operação": l["OPERACAO"],
                "Tipo": l["TIPO"],
            }
            for l in resultado.linhas
        ]
        return ep.CABECALHO_MODELO_CONTAS, linhas
    if chave == "cupons":
        return ep.CABECALHO_CUPONS, resultado.linhas
    if chave == "prazo":
        return ep.CABECALHO_PRAZO, resultado.linhas
    raise KeyError(chave)


def partes(cabecalho: list[str], linhas: list[dict]):
    for inicio in range(0, max(len(linhas), 1), LINHAS_POR_PARTE):
        bloco = linhas[inicio : inicio + LINHAS_POR_PARTE]
        dados = {
            "cabecalho": cabecalho,
            "linhas": [[valor_json(l.get(c)) for c in cabecalho] for l in bloco],
        }
        yield (
            len(bloco),
            gzip.compress(json.dumps(dados, ensure_ascii=False).encode("utf-8")),
        )


# ---------------- FLUXO PRINCIPAL ----------------
def extrair_e_enviar(senha: str, banco: str, copia_local: bool, aviso=print) -> str:
    config = ler_config()
    aviso("Conferindo o acesso ao painel web...")
    requisicao(config, "GET", "/api/agente/ping")

    aviso(f"Lendo o banco {banco} (pode levar alguns minutos)...")
    resultados = ep.carregar_tudo(senha, banco)

    if copia_local:
        pasta, _feitos = ep.exportar_todas(resultados, banco, ep.pasta_saida())
        aviso(f"Copia local salva em {pasta}")

    extracao = enviar_json(
        config,
        "/api/agente/extracoes",
        {"banco": banco, "maquina": platform.node(), "versao": VERSAO},
    )["id"]
    resumo: dict = {}
    for modulo in ep.MODULOS:
        resultado = resultados.get(modulo.chave)
        if isinstance(resultado, BaseException):
            resumo[modulo.chave] = {"erro": ep.mensagem_erro(resultado)}
            aviso(f"{modulo.nome}: erro - {resumo[modulo.chave]['erro']}")
            continue
        if resultado is None:
            continue
        cabecalho, linhas = linhas_do_modulo(modulo.chave, resultado)
        if not linhas:
            resumo[modulo.chave] = {"linhas": 0}
            continue
        total = (len(linhas) + LINHAS_POR_PARTE - 1) // LINHAS_POR_PARTE
        for numero, (quantidade, dados) in enumerate(partes(cabecalho, linhas)):
            aviso(f"Enviando {modulo.nome}: parte {numero + 1} de {total}")
            requisicao(
                config,
                "POST",
                f"/api/agente/extracoes/{extracao}/partes?modulo={modulo.chave}&parte={numero}&linhas={quantidade}",
                dados,
                "application/octet-stream",
            )
        resumo[modulo.chave] = {"linhas": len(linhas)}
        if resultado.aviso:
            resumo[modulo.chave]["aviso"] = resultado.aviso

    retorno = enviar_json(config, f"/api/agente/extracoes/{extracao}/concluir", resumo)
    url = config["url"] + retorno.get("url", f"/extracao/{extracao}")
    aviso("Pronto! Abrindo o painel...")
    return url


# ---------------- JANELA ----------------
def janela() -> None:
    import tkinter as tk
    from tkinter import messagebox, ttk

    raiz = tk.Tk()
    raiz.title("Agente web - Conversor SysLoja")
    raiz.geometry("520x380")
    raiz.configure(
        bg=ep.COR.get("fundo", "#0f1419") if isinstance(ep.COR, dict) else "#0f1419"
    )
    estilo = {"bg": "#0f1419", "fg": "#e6edf3", "font": (ep.FONTE, 10)}

    tk.Label(raiz, text="Senha do MySQL (root)", **estilo).pack(
        anchor="w", padx=16, pady=(16, 2)
    )
    senha = tk.Entry(raiz, show="•", font=(ep.FONTE, 11))
    senha.pack(fill="x", padx=16)

    tk.Label(raiz, text="Banco", **estilo).pack(anchor="w", padx=16, pady=(10, 2))
    banco = ttk.Combobox(raiz, state="readonly", font=(ep.FONTE, 10))
    banco.pack(fill="x", padx=16)

    copia = tk.BooleanVar(value=False)
    tk.Checkbutton(
        raiz,
        text="Salvar também as planilhas na Área de Trabalho",
        variable=copia,
        selectcolor="#171e26",
        activebackground="#0f1419",
        **estilo,
    ).pack(anchor="w", padx=12, pady=6)

    botoes = tk.Frame(raiz, bg="#0f1419")
    botoes.pack(fill="x", padx=16)
    log = tk.Text(
        raiz, height=8, bg="#171e26", fg="#8b98a5", font=("Consolas", 9), relief="flat"
    )
    log.pack(fill="both", expand=True, padx=16, pady=12)

    fila: queue.Queue = queue.Queue()

    def escrever(texto: str) -> None:
        fila.put(("log", texto))

    def processar_fila() -> None:
        while not fila.empty():
            tipo, conteudo = fila.get()
            if tipo == "log":
                log.insert("end", conteudo + "\n")
                log.see("end")
            elif tipo == "bancos":
                banco["values"] = [
                    f"{nome}  ({qtd:,} produtos)".replace(",", ".")
                    for nome, qtd in conteudo
                ]
                banco.nomes = [nome for nome, _ in conteudo]  # type: ignore[attr-defined]
                if conteudo:
                    banco.current(0)
                enviar_btn.config(state="normal")
            elif tipo == "fim":
                enviar_btn.config(state="normal")
                webbrowser.open(conteudo)
            elif tipo == "erro":
                enviar_btn.config(state="normal")
                messagebox.showerror("Agente web", conteudo, parent=raiz)
        raiz.after(150, processar_fila)

    def em_segundo_plano(funcao) -> None:
        def rodar():
            try:
                funcao()
            except Exception as erro:  # noqa: BLE001 - mostra ao usuario
                fila.put(("log", f"ERRO: {erro}"))
                fila.put(("erro", ep.mensagem_erro(erro)))

        threading.Thread(target=rodar, daemon=True).start()

    def conectar() -> None:
        escrever("Conectando no MySQL...")
        em_segundo_plano(lambda: fila.put(("bancos", ep.listar_bancos(senha.get()))))

    def enviar() -> None:
        nomes = getattr(banco, "nomes", [])
        if not nomes or banco.current() < 0:
            conectar()
            return
        escolhido = nomes[banco.current()]
        enviar_btn.config(state="disabled")
        em_segundo_plano(
            lambda: fila.put(
                ("fim", extrair_e_enviar(senha.get(), escolhido, copia.get(), escrever))
            )
        )

    tk.Button(botoes, text="Listar bancos", command=conectar).pack(side="left")
    enviar_btn = tk.Button(
        botoes, text="Extrair e enviar", command=enviar, state="disabled"
    )
    enviar_btn.pack(side="right")
    senha.bind("<Return>", lambda _e: conectar())
    senha.focus_set()

    try:
        cfg = ler_config()
        escrever(f"Painel: {cfg['url']}")
    except Exception as erro:  # noqa: BLE001
        escrever(f"ATENCAO: {erro}")
    processar_fila()
    raiz.mainloop()


def main() -> None:
    args = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    args.add_argument("--senha")
    args.add_argument("--banco")
    args.add_argument("--copia-local", action="store_true")
    opcoes = args.parse_args()
    if opcoes.senha is not None and opcoes.banco:
        url = extrair_e_enviar(opcoes.senha, opcoes.banco, opcoes.copia_local)
        print(url)
        return
    janela()


if __name__ == "__main__":
    main()
