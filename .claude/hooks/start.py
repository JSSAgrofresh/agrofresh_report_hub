#!/usr/bin/env python3
"""Si el mensaje del usuario es solo «start» (o /start, inicio), le recuerda a Claude, justo
junto a ese mensaje, que lo PRIMERO es abrir el aviso de despliegue (Artifact «Despliegue»).
Es la misma regla del recuadro de CLAUDE.md, pero puesta por el sistema en cada chat nuevo
(el usuario trabaja en muchos chats cortos y necesita que se abra siempre de primera)."""
import json
import re
import sys

URL = "https://claude.ai/artifact/A1q3w9WBh2Zc3sStYRuYDE"

try:
    prompt = str(json.load(sys.stdin).get("prompt", ""))
except Exception:
    sys.exit(0)

if not re.fullmatch(r"\s*/?(start|inicio)\s*[.!]?\s*", prompt, re.I):
    sys.exit(0)

instruccion = (
    "REGLA DEL PROYECTO (CLAUDE.md, recuadro del inicio): el mensaje del usuario es «start». "
    "No preguntes qué quiere hacer y no ofrezcas opciones. Haz AHORA, antes que nada: "
    f"1) lee el Artifact {URL} con Artifact action:'read' y anota el data-n de <div class=\"version\"> "
    "(la «Actualización #N») y los pasos manuales del servidor que trae la tarjeta (pull, migración, reinicio, script); "
    f"2) ábrelo con Artifact action:'open' sobre ese mismo url (no lo republiques ni crees otro); "
    "3) responde en español con UNA sola línea: el enlace, «Actualización #N» y qué pasos del servidor quedan "
    "(o «nada que hacer en el servidor»). No empieces ninguna otra tarea."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": instruccion}}))
