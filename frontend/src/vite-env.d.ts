/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_API_AUTH_URL?: string;
  readonly VITE_API_PROJECTS_URL?: string;
  readonly VITE_API_ENDPOINTS_URL?: string;
  readonly VITE_API_MONITORING_URL?: string;
  readonly VITE_API_LOGS_URL?: string;
  readonly VITE_API_ALERTS_URL?: string;
  readonly VITE_API_AI_URL?: string;
  readonly VITE_API_TESTING_URL?: string;
  readonly VITE_API_OPENAPI_URL?: string;
  readonly VITE_API_NOTIFICATIONS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

