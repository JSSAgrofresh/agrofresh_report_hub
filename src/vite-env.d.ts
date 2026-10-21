/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de la pantalla publicada (commit en Vercel o fecha de compilación). */
declare const __BUILD__: string
