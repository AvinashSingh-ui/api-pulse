export type Role = 'admin' | 'developer' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  role: Role;
  createdAt: string;
}

export type ProjectStatus = 'active' | 'inactive' | 'archived' | 'deleted';
export type Environment = 'production' | 'staging' | 'development';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  baseUrl: string;
  environment: Environment;
  endpointCount: number;
  healthScore: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  userId?: string;
  deletedAt?: string | null;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type EndpointStatus = 'healthy' | 'degraded' | 'down' | 'unknown' | 'paused';

export interface Endpoint {
  id: string;
  projectId: string;
  name: string;
  path: string;
  method: HttpMethod;
  status: EndpointStatus;
  interval: number; // in seconds, e.g. 15, 30, 60, 300
  expectedStatus: number; // default 200
  timeout: number; // in ms, default 5000
  headers?: Record<string, string>;
  body?: string;
  captureBodies?: boolean;
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
  uptime: number;
  requestsPerMin: number;
  errorRate: number;
  lastChecked: string;
  tags: string[];
  assertions?: AssertionRule[];
}

export interface AssertionRule {
  id: string;
  type: 'status_code' | 'response_time' | 'body_contains' | 'header_exists' | 'json_path';
  operator: 'equals' | 'less than' | 'greater than' | 'contains' | 'exists';
  expected: string;
  enabled: boolean;
}

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

export type FailureType = 'timeout' | 'connection_refused' | 'unexpected_status' | 'schema_mismatch' | 'network_error' | 'none';

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
  error?: string;
  failureType?: FailureType;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBodySnippet?: string;
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type AlertTrigger = 'response_time' | 'error_rate' | 'downtime' | 'status_code' | 'consecutive_failures';

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
  likelyCauses?: { cause: string; confidence: 'high' | 'medium' | 'low'; evidence: string }[];
  suggestedChecks?: string[];
  suggestedFix?: {
    summary: string;
    codeSnippet?: string;
    language?: string;
    steps?: string[];
  };
}

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

export interface TestCase {
  id: string;
  name: string;
  endpointId: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  assertions: {
    id: string;
    type: 'status_code' | 'response_time' | 'body_contains' | 'header_exists' | 'json_path';
    expected: string | number;
    operator: 'eq' | 'lt' | 'gt' | 'contains' | 'exists';
  }[];
  lastRunAt?: string;
  lastStatus?: TestStatus;
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
  needingAttention: {
    endpointId: string;
    name: string;
    path: string;
    method: HttpMethod;
    status: EndpointStatus;
    p95: number;
    uptime: number;
  }[];
  recentActivity: {
    id: string;
    time: string;
    endpointName: string;
    status: 'pass' | 'fail';
    failureType: string;
    duration: number;
  }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

