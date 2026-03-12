/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WIND_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
