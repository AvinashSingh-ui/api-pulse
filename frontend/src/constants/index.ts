// ── API ───────────────────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
export const API_TIMEOUT = 30_000;

// ── Auth ──────────────────────────────────────────────────
export const TOKEN_KEY   = 'api_pulse_token';
export const USER_KEY    = 'api_pulse_user';
export const TOKEN_TTL   = 24 * 60 * 60 * 1000; // 24 h in ms

// ── Pagination ────────────────────────────────────────────
export const DEFAULT_PAGE      = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ── Polling ───────────────────────────────────────────────
export const MONITORING_POLL_INTERVAL = 30_000;  // 30s
export const ALERTS_POLL_INTERVAL     = 15_000;  // 15s

// ── Status colors (for Ant Design tag/badge) ──────────────
export const STATUS_COLORS = {
  healthy:    'success',
  degraded:   'warning',
  down:       'error',
  unknown:    'default',
  active:     'processing',
  inactive:   'default',
  archived:   'default',
} as const;

export const HTTP_METHOD_COLORS: Record<string, string> = {
  GET:     '#22c55e',
  POST:    '#4f8ef7',
  PUT:     '#f59e0b',
  PATCH:   '#8b5cf6',
  DELETE:  '#ef4444',
  HEAD:    '#64748b',
  OPTIONS: '#94a3b8',
};

export const ALERT_SEVERITY_COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#3b82f6',
} as const;

export const ALERT_SEVERITY_RANK = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
} as const;

// ── Chart ─────────────────────────────────────────────────
export const CHART_COLORS = [
  '#4f8ef7',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#00d4aa',
  '#f97316',
  '#06b6d4',
];

export const CHART_GRID_COLOR   = '#e2e8f0';
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
};

// ── Routes ────────────────────────────────────────────────
export const ROUTES = {
  LOGIN:       '/login',
  DASHBOARD:   '/',
  PROJECTS:    '/projects',
  PROJECT:     '/projects/:id',
  ENDPOINTS:   '/endpoints',
  ENDPOINT:    '/endpoints/:id',
  MONITORING:  '/monitoring',
  TESTING:     '/testing',
  LOGS:        '/logs',
  ALERTS:      '/alerts',
  AI_ANALYSIS: '/ai-analysis',
  SETTINGS:    '/settings',
} as const;

// ── Environment badge labels ───────────────────────────────
export const ENV_LABELS = {
  production:  'Production',
  staging:     'Staging',
  development: 'Development',
} as const;

export const ENV_COLORS = {
  production:  'red',
  staging:     'orange',
  development: 'blue',
} as const;

// ── Response time thresholds (ms) ─────────────────────────
export const RESPONSE_TIME_GOOD    = 200;
export const RESPONSE_TIME_WARN    = 500;
export const RESPONSE_TIME_CRITICAL = 1000;

// ── Uptime thresholds (%) ─────────────────────────────────
export const UPTIME_GOOD    = 99.5;
export const UPTIME_WARN    = 98;
export const UPTIME_CRITICAL = 95;
