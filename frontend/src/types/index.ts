// ── Auth ──────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'developer' | 'viewer';
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'developer' | 'viewer';
}

// ── Projects ──────────────────────────────────────────────
export type ProjectStatus = 'active' | 'inactive' | 'archived' | 'deleted';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  baseUrl: string;
  environment: 'production' | 'staging' | 'development';
  endpointCount: number;
  healthScore: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  userId?: string;
  deletedAt?: string | null;
}

// ── Endpoints ─────────────────────────────────────────────
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type EndpointStatus = 'healthy' | 'degraded' | 'down' | 'unknown' | 'paused';

export interface Endpoint {
  id: string;
  projectId: string;
  name: string;
  path: string;
  method: HttpMethod;
  status: EndpointStatus;
  interval?: number;
  timeout?: number;
  expectedStatus?: number;
  headers?: Record<string, string>;
  body?: string;
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
  uptime: number;
  requestsPerMin: number;
  errorRate: number;
  lastChecked: string;
  tags: string[];
}

// ── Monitoring ────────────────────────────────────────────
export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface MonitoringData {
  endpointId: string;
  responseTime: MetricPoint[];
  requestVolume: MetricPoint[];
  errorRate: MetricPoint[];
  uptime: MetricPoint[];
}

export interface UptimeRecord {
  date: string;
  status: 'up' | 'down' | 'degraded';
  uptime: number;
  incidents: number;
}

// ── Logs ──────────────────────────────────────────────────
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface RequestLog {
  id: string;
  endpointId: string;
  projectId: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  responseTime: number;
  requestSize: number;
  responseSize: number;
  ip: string;
  userAgent: string;
  timestamp: string;
  failureType?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  error?: string;
}

// ── Alerts ────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type AlertTrigger = 'response_time' | 'error_rate' | 'downtime' | 'status_code' | 'request_volume';

export interface AlertRule {
  id: string;
  projectId: string;
  endpointId?: string;
  name: string;
  trigger: AlertTrigger;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  severity: AlertSeverity;
  isEnabled: boolean;
  channels: ('email' | 'slack' | 'webhook' | 'sms')[];
  createdAt: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  projectId: string;
  endpointId?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  value: number;
  threshold: number;
}

// ── AI Analysis ───────────────────────────────────────────
export interface AIInsight {
  id: string;
  type: 'anomaly' | 'trend' | 'recommendation' | 'prediction';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  endpointId?: string;
  projectId?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  likelyCauses?: Array<{ cause: string; confidence: string; evidence: string }>;
  suggestedChecks?: string[];
  suggestedFix?: {
    summary: string;
    codeSnippet?: string;
    language?: string;
    steps?: string[];
  };
}

// ── Testing ───────────────────────────────────────────────
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

export interface TestCase {
  id: string;
  name: string;
  endpointId: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  assertions: TestAssertion[];
  lastRunAt?: string;
  lastStatus?: TestStatus;
}

export interface TestAssertion {
  id: string;
  type: 'status_code' | 'response_time' | 'body_contains' | 'header_exists' | 'json_path';
  expected: string | number;
  operator: 'eq' | 'lt' | 'gt' | 'contains' | 'exists';
}

export interface TestResult {
  id: string;
  testCaseId: string;
  status: TestStatus;
  statusCode: number;
  responseTime: number;
  responseBody: string;
  assertionResults: {
    assertionId: string;
    passed: boolean;
    actual: string | number;
    expected: string | number;
  }[];
  runAt: string;
  error?: string;
}

// ── Dashboard ─────────────────────────────────────────────
export interface DashboardStats {
  totalProjects: number;
  totalEndpoints: number;
  avgUptime: number;
  avgResponseTime: number;
  activeAlerts: number;
  requestsToday: number;
  errorRateToday: number;
  healthyEndpoints: number;
  degradedEndpoints: number;
  downEndpoints: number;
}

// ── API Generic ───────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface SelectOption {
  label: string;
  value: string | number;
}

export type SortOrder = 'asc' | 'desc';

export interface TableParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  search?: string;
  filters?: Record<string, string | string[]>;
}
