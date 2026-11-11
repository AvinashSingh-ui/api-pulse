import React from 'react';
import { Card, Skeleton, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;        // percentage change
    direction: 'up' | 'down' | 'neutral';
    label?: string;
    isPositive?: boolean; // override — sometimes "up" is bad (error rate)
  };
  color?: string;
  loading?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = '#4f8ef7',
  loading = false,
  tooltip,
  onClick,
}) => {
  const getTrendColor = () => {
    if (!trend) return '#94a3b8';
    const isGood =
      trend.isPositive !== undefined
        ? trend.isPositive
        : trend.direction === 'up';
    return isGood ? '#22c55e' : '#ef4444';
  };

  const TrendIcon =
    !trend ? null
    : trend.direction === 'up'   ? ArrowUpRight
    : trend.direction === 'down' ? ArrowDownRight
    : Minus;

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease',
      }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{title}</span>
                {tooltip && (
                  <Tooltip title={tooltip}>
                    <InfoCircleOutlined style={{ fontSize: 12, color: '#94a3b8' }} />
                  </Tooltip>
                )}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                {value}
              </div>
              {subtitle && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{subtitle}</div>
              )}
            </div>
            {icon && (
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: `${color}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color,
                fontSize: 20,
                flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
          </div>

          {trend && TrendIcon && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
              <TrendIcon size={14} color={getTrendColor()} />
              <span style={{ fontSize: 12, color: getTrendColor(), fontWeight: 500 }}>
                {Math.abs(trend.value).toFixed(1)}%
              </span>
              {trend.label && (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{trend.label}</span>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
