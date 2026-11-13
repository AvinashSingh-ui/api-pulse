import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import {
  RESPONSE_TIME_GOOD,
  RESPONSE_TIME_WARN,
  UPTIME_GOOD,
  UPTIME_WARN,
} from '@/constants';
import type { HttpMethod, AlertSeverity, EndpointStatus } from '@/types';

dayjs.extend(relativeTime);
dayjs.extend(duration);

// ── Date / time ───────────────────────────────────────────
export const formatDate = (iso: string) =>
  dayjs(iso).format('MMM D, YYYY');

export const formatDateTime = (iso: string) =>
  dayjs(iso).format('MMM D, YYYY HH:mm');

export const formatTime = (iso: string) =>
  dayjs(iso).format('HH:mm:ss');

export const fromNow = (iso: string) =>
  dayjs(iso).fromNow();

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
};

// ── Numbers / sizes ───────────────────────────────────────
export const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

export const formatPercent = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals)}%`;

export const formatResponseTime = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

// ── Status helpers ────────────────────────────────────────
export const getResponseTimeStatus = (ms: number): 'good' | 'warn' | 'critical' => {
  if (ms <= RESPONSE_TIME_GOOD) return 'good';
  if (ms <= RESPONSE_TIME_WARN) return 'warn';
  return 'critical';
};

export const getUptimeStatus = (pct: number): 'good' | 'warn' | 'critical' => {
  if (pct >= UPTIME_GOOD) return 'good';
  if (pct >= UPTIME_WARN) return 'warn';
  return 'critical';
};

export const getStatusColor = (status: EndpointStatus): string => {
  const map: Record<EndpointStatus, string> = {
    healthy:   '#22c55e',
    degraded:  '#f59e0b',
    down:      '#ef4444',
    unhealthy: '#ef4444',
    paused:    '#94a3b8',
    unknown:   '#94a3b8',
  };
  return map[status];
};

export const getHttpMethodColor = (method: HttpMethod): string => {
  const map: Record<HttpMethod, string> = {
    GET:     '#22c55e',
    POST:    '#4f8ef7',
    PUT:     '#f59e0b',
    PATCH:   '#8b5cf6',
    DELETE:  '#ef4444',
    HEAD:    '#64748b',
    OPTIONS: '#94a3b8',
  };
  return map[method];
};

export const getSeverityColor = (severity: AlertSeverity): string => {
  const map: Record<AlertSeverity, string> = {
    critical: '#ef4444',
    high:     '#f97316',
    medium:   '#f59e0b',
    low:      '#3b82f6',
  };
  return map[severity];
};

export const getStatusCodeColor = (code: number): string => {
  if (code < 300) return '#22c55e';
  if (code < 400) return '#3b82f6';
  if (code < 500) return '#f59e0b';
  return '#ef4444';
};

// ── String helpers ────────────────────────────────────────
export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

export const truncate = (s: string, max = 60): string =>
  s.length > max ? `${s.slice(0, max)}...` : s;

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

// ── URL helpers ───────────────────────────────────────────
export const buildUrl = (base: string, params: Record<string, string | number | boolean | undefined>): string => {
  const url = new URL(base, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  return url.pathname + url.search;
};

// ── Array helpers ─────────────────────────────────────────
export const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> =>
  arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});

export const sortBy = <T>(arr: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] =>
  [...arr].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av < bv) return order === 'asc' ? -1 : 1;
    if (av > bv) return order === 'asc' ? 1 : -1;
    return 0;
  });

// ── Local storage ─────────────────────────────────────────
export const storage = {
  get: <T>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set: <T>(key: string, value: T): void => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
  },
  remove: (key: string): void => localStorage.removeItem(key),
};

// ── Misc ──────────────────────────────────────────────────
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export const noop = (): void => { /* intentionally empty */ };

export const clamp = (val: number, min: number, max: number): number =>
  Math.min(Math.max(val, min), max);

export const generateId = (): string =>
  Math.random().toString(36).slice(2, 11);
