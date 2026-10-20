---
description: Abre el aviso de despliegue y el Artifact «Tareas Report Hub»
---

Haz esto de inmediato, ANTES de cualquier otra cosa y sin preguntar nada:

1. Lee el artifact del aviso de despliegue con `Artifact` `action: "read"` y
   `url: https://claude.ai/artifact/A1q3w9WBh2Zc3sStYRuYDE`. Es la última versión que dejó el chat anterior.
   Anota el `data-n` de `<div class="version">` (la «Actualización #N») y los pasos del servidor que trae la
   tarjeta (los `<li class="manual">` y los bloques con título `<h3>`: pull, migración, reinicio, script).
2. Ábrelo con `Artifact` `action: "open"` sobre ese mismo `url`. **No publiques ni crees otro artifact.**
3. Abre también `Artifact` `action: "open"` sobre `url: https://claude.ai/artifact/Jz3ax512MjvfhNgVpzkv1D` («Tareas Report Hub») y lee con `ArtifactData`
   (colección `tareas`, y `config/lote` para la entrega) cuántas tareas siguen pendientes y cuál toca primero.
4. Responde en español con DOS líneas como máximo: (a) enlace del despliegue, «Actualización #N» y qué pasos del
   servidor quedan (o «nada que hacer en el servidor»); (b) enlace de Tareas Report Hub, cuántas pendientes y la que
   toca primero. No empieces ninguna otra tarea. Si `open` falla, da igual los enlaces y los números.
