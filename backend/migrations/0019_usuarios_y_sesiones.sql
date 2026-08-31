-- ----------------------------------------------------------------------------
-- 0019 - Usuarios con contrasena y sesiones del servidor
--
-- Hasta acá el padrón de cuentas vivía en `solicitudes/_config/usuarios.json`
-- (R2 o disco) y el login no validaba nada: cualquier texto en el campo de
-- contrasena dejaba entrar. Los permisos existían solo en el navegador, así
-- que la API entera estaba abierta a quien supiera su URL.
--
-- Dos tablas:
--
--   usuario  el padrón, con la huella de la contrasena. Reemplaza al JSON:
--            un archivo que se lee y reescribe entero pierde cambios cuando
--            dos administradores editan a la vez, y eso deja de ser tolerable
--            cuando lo que se pierde son permisos.
--
--   sesion   las credenciales vigentes. Se guarda la HUELLA del token, no el
--            token: si alguien se lleva una copia de la base, no puede
--            hacerse pasar por nadie. Sesiones del servidor y no JWT porque
--            así cerrar sesión, expulsar a alguien o revocar todo tras un
--            incidente es un DELETE, no esperar a que venza una firma.
--
-- Nadie nace con contrasena. Se asigna con `python scripts/clave.py <correo>`,
-- que la pide por teclado: una contrasena escrita en un archivo de migración
-- termina en el historial de git para siempre.
--
-- Es idempotente: se puede ejecutar sobre una base que ya las tenga.
-- ----------------------------------------------------------------------------

SET search_path = lab, public;

CREATE TABLE IF NOT EXISTS usuario (
    id              SERIAL PRIMARY KEY,
    email           TEXT        NOT NULL,
    nombre          TEXT        NOT NULL,
    tipo_acceso     TEXT        NOT NULL,
    area            TEXT,
    -- Para cuentas tipo `cliente`: a qué Sold To (y opcionalmente a qué Ship
    -- To) puede ver. El backend saca de ACÁ el filtro de los reportes; nunca
    -- del parámetro que manda el navegador.
    cliente_nombre  TEXT,
    planta_nombre   TEXT,
    modulos         TEXT[],
    reportes        TEXT[],
    -- NULL = la cuenta existe pero todavía no puede entrar. Es el estado en
    -- que quedan las cuentas migradas desde el JSON hasta que alguien les
    -- asigna una contrasena.
    password_hash   TEXT,
    -- Contrasena puesta por un administrador: hay que cambiarla al entrar.
    debe_cambiar    BOOLEAN     NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El correo identifica la cuenta y se compara sin distinguir mayúsculas:
-- "Jorge@..." y "jorge@..." son la misma persona, y dos filas así harían que
-- cuál de las dos responde al login dependiera del orden del índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_email ON usuario (lower(email));

CREATE TABLE IF NOT EXISTS sesion (
    -- SHA-256 del token en hexadecimal. El token en claro solo existe en el
    -- navegador de quien inició sesión.
    token_hash  TEXT        PRIMARY KEY,
    usuario_id  INTEGER     NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en   TIMESTAMPTZ NOT NULL,
    ultimo_uso  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Borrar todas las sesiones de una cuenta (al cambiar su contrasena, al
-- quitarle permisos o al eliminarla) tiene que ser barato: pasa en cada uno
-- de esos casos y no puede recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_sesion_usuario ON sesion (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesion_expira  ON sesion (expira_en);
