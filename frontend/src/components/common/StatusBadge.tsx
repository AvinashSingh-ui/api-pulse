import React from 'react';
import { Badge, Tag } from 'antd';
import type { EndpointStatus, AlertSeverity } from '@/types';

interface StatusBadgeProps {
  status: EndpointStatus;
  showDot?: boolean;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<EndpointStatus, { color: string; label: string; badgeStatus: 'success' | 'warning' | 'error' | 'default' }> = {
  healthy:   { color: 'success', label: 'Healthy',   badgeStatus: 'success' },
  degraded:  { color: 'warning', label: 'Degraded',  badgeStatus: 'warning' },
  down:      { color: 'error',   label: 'Down',      badgeStatus: 'error'   },
  unhealthy: { color: 'error',   label: 'Unhealthy', badgeStatus: 'error'   },
  paused:    { color: 'default', label: 'Paused',    badgeStatus: 'default' },
  unknown:   { color: 'default', label: 'Unknown',   badgeStatus: 'default' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, showDot = true, size = 'md' }) => {
  const cfg = STATUS_MAP[status];
  if (showDot) {
    return (
      <Badge status={cfg.badgeStatus} text={cfg.label} style={{ fontSize: size === 'sm' ? 12 : 14 }} />
    );
  }
  return <Tag color={cfg.color} style={{ fontSize: size === 'sm' ? 11 : 12 }}>{cfg.label}</Tag>;
};

interface SeverityBadgeProps {
  severity: AlertSeverity;
}

const SEVERITY_MAP: Record<AlertSeverity, { color: string; label: string }> = {
  critical: { color: 'red',    label: 'Critical' },
  high:     { color: 'orange', label: 'High'     },
  medium:   { color: 'gold',   label: 'Medium'   },
  low:      { color: 'blue',   label: 'Low'      },
};

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const cfg = SEVERITY_MAP[severity];
  return <Tag color={cfg.color} style={{ fontSize: 11, fontWeight: 600 }}>{cfg.label.toUpperCase()}</Tag>;
};
