# AgroFresh Report Hub

Plataforma de unificación y análisis de residuos de pesticidas en fruta — ETL, base de datos
normalizada y reportes automatizados para laboratorio interno y externos.

Frontend construido con **React + Vite + TypeScript**.

## Stack

- [Vite](https://vite.dev) — bundler y dev server
- [React 19](https://react.dev) + [React Router](https://reactrouter.com) — UI y ruteo
- [TypeScript](https://www.typescriptlang.org) en modo estricto
- [ESLint](https://eslint.org) (flat config) + [Prettier](https://prettier.io)
- [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com) — pruebas
- CSS Modules con design tokens (`src/styles/globals.css`)

## Scripts

```bash
npm run dev          # servidor de desarrollo
npm run build         # typecheck + build de producción
npm run preview       # sirve el build de producción localmente
npm run lint           # ESLint
npm run lint:fix       # ESLint con --fix
npm run format          # Prettier --write
npm run format:check     # Prettier --check
npm run typecheck        # tsc sin emitir archivos
npm run test               # Vitest (una corrida)
npm run test:watch          # Vitest en modo watch
```

## Estructura de `src/`

El código está organizado por responsabilidad, no por tipo de archivo: cada vista o dominio
de negocio vive junto a su propia lógica.

```
src/
├── app/                  # Cableado de la aplicación
│   ├── App.tsx            # Componente raíz
│   ├── router.tsx          # Definición de rutas (React Router)
│   └── providers/           # Providers globales (contexto, temas, etc.)
│
├── views/                 # Páginas/pantallas — una carpeta por ruta
│   ├── dashboard/
│   ├── reports/
│   ├── samples/
│   └── not-found/
│
├── features/                # Módulos de dominio (lógica + UI de negocio)
│   ├── reports/
│   │   ├── api/               # Llamadas a la API específicas del dominio
│   │   ├── components/         # Componentes propios del feature
│   │   ├── hooks/                # Hooks propios del feature
│   │   ├── types.ts               # Tipos del dominio
│   │   └── index.ts                # Barrel de exports públicos
│   └── samples/
│       └── ... (misma forma)
│
├── components/               # UI compartida y reutilizable entre features
│   ├── ui/                     # Componentes de presentación (Button, Card, Badge…)
│   └── layout/                  # Layout de la app (Sidebar, Header, AppLayout)
│
├── hooks/                      # Hooks compartidos, sin lógica de negocio
├── lib/                          # Utilidades puras (formateo, helpers, etc.)
├── services/                      # Clientes de infraestructura (HTTP, etc.)
├── types/                          # Tipos compartidos entre todo el proyecto
├── constants/                       # Constantes globales (rutas, etc.)
├── styles/                           # CSS global y design tokens
└── test/                              # Setup de pruebas
```

**Regla de dependencia:** `views` puede importar de `features` y `components`; `features` puede
importar de `components`, `hooks`, `lib`, `services` y `types`; `components`, `hooks`, `lib` y
`services` no dependen de `features` ni de `views`. Esto evita ciclos y mantiene cada capa
reutilizable.

Los alias de import usan `@/` apuntando a `src/` (configurado en `tsconfig.app.json` y
`vite.config.ts`), por ejemplo `import { Button } from '@/components/ui/Button'`.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores. Todas las variables consumidas por el
cliente deben tener el prefijo `VITE_` (requisito de Vite).

## Convenciones

- Componentes en PascalCase (`ReportsTable.tsx`), un componente principal por archivo.
- Estilos con CSS Modules (`Component.module.css`) junto al componente que los usa.
- Cada `feature` expone su API pública a través de `index.ts`; el resto de sus archivos son
  detalles internos y no deberían importarse directamente desde fuera del feature.
