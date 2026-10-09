---
description: Abre el aviso de despliegue (el Artifact «Despliegue») y dice en qué actualización va el servidor
---

Haz esto de inmediato, ANTES de cualquier otra cosa y sin preguntar nada:

1. Lee el artifact del aviso de despliegue con `Artifact` `action: "read"` y
   `url: https://claude.ai/artifact/A1q3w9WBh2Zc3sStYRuYDE`. Es la última versión que dejó el chat anterior.
   Anota el `data-n` de `<div class="version">` (la «Actualización #N») y los pasos del servidor que trae la
   tarjeta (los `<li class="manual">` y los bloques con título `<h3>`: pull, migración, reinicio, script).
2. Ábrelo con `Artifact` `action: "open"` sobre ese mismo `url`. **No publiques ni crees otro artifact.**
3. Responde en español con UNA línea: el enlace, la actualización «#N» y qué pasos manuales del servidor quedan
   (o «nada que hacer en el servidor» si la tarjeta no pide ninguno). Nada más, y no empieces ninguna otra tarea.
   Si `open` falla, da igual el enlace y el número.
