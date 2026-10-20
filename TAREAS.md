# Historial de tareas

Se lleva en dos lugares que se actualizan juntos:

- **El Artifact «Tareas Report Hub»** (https://claude.ai/artifact/Jz3ax512MjvfhNgVpzkv1D): es donde el usuario marca con checks. Se guarda en su base (`ArtifactData`, colección `tareas`; el lote está en `config/lote`), no se pierde.
- **Este archivo**: el resumen por lote, para que cualquier chat nuevo sepa qué se pidió y qué quedó hecho.

Cada vez que el usuario cuente una reunión o dé tareas nuevas: agrégalas al Artifact (`ArtifactData` `batch`, con `dia`, `horas` y `dificultad`; lo más difícil va primero en el día) y anótalas aquí. Al cerrar una, márcala hecha en el Artifact y aquí.

## Lote: entrega jueves 22-10-2026, 00:00 (hora de Chile; el usuario dijo «12 am»)

Plan: martes 20 → 10, 9, 4; miércoles 21 → 8, 7. Los puntos 5 y 6 esperan al laboratorio.

| N° | Tarea | Estado |
|---|---|---|
| 1 | Fecha en cada punto del gráfico de residuales | Hecha (19-10, PR 495) |
| 2 | Una curva por laboratorio para el mismo analito | Hecha (19-10, PR 495); 20-10: el filtro Ingrediente Activo solo ofrece analitos de residuos (PR 511) |
| 3 | Quitar el contador entre paréntesis de los filtros de Report | Hecha (19-10, PR 495) |
| 4 | Preguntar a Daniel los límites de FSMA (E. coli y coliformes) | Pendiente |
| 5 | Dona cumple / no cumple de E. coli y coliformes | Espera al 4 |
| 6 | Diagnofruit: rangos por especie, fruta y agua (hoy solo Carozos) | Espera al laboratorio |
| 7 | Auditoría de informes enviados a clientes (Panel de control interno) | Pendiente |
| 8 | Dashboard one page para clientes (la primera maqueta no gustó) | Pendiente, falta definir la dirección |
| 9 | Tipo de análisis en la columna A de los Excel | Hecha (20-10, PR 514) en la BD de Report y «Descargar con muestra»; la matriz masiva de Solicitudes no la lleva |
| 10 | Cuentas de comerciales con alcance solo a sus plantas (técnicos fuera) | Hecha (20-10, migración 0063); las cuentas ya se ven en Usuarios |

| 11 | Dar más módulos a los comerciales, acotados a sus plantas | Hecha (20-10): Panel de control interno (sin Carpetas de auditoría), Solicitudes e informes y los informes Accu-Tab (Postventa); se cerró un hueco donde un comercial veía los Accu-Tab de todos. El resto de los módulos no se acota a plantas (internos o de escritura) |

| 12 | Arreglar el envío de correo por Gmail (clave sin espacios y respaldo por Resend) | Hecha (20-10, PR 512 y 513); falta confirmar en el servidor |
| 13 | Revocar y regenerar las claves de Gmail y Resend que se vieron en el chat | Pendiente |
| 14 | Avisar en pantalla cuando falla el envío automático | Pendiente |
| 15 | Determinar la causa exacta del corte con Google (log de envíos, otra red, aviso de Cloud) | Pendiente |
| 16 | Correr en el servidor la migración 0047 (la 0063 y las cuentas de comerciales ya están) | Pendiente |
