/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_NODE_DATA_MODE?: 'real' | 'mock' | 'mixed';
  readonly VITE_DEBUG_PARKING_SLOTS?: string;
  readonly VITE_DEBUG_PARKING_ALIGNMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
