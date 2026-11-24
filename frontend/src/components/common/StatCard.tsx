import React from 'react';
import { Card, Skeleton, Tooltip, Typography } from 'antd';
import {
  InfoCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

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
  color = '#71717a',
  loading = false,
  tooltip,
  onClick,
}) => {
  const getTrendColor = () => {
    if (!trend) return 'var(--color-text-tertiary)';
    const isGood =
      trend.isPositive !== undefined
        ? trend.isPositive
        : trend.direction === 'up';
    return isGood ? '#10b981' : '#ef4444';
  };

  const renderTrendIcon = () => {
    if (!trend) return null;
    if (trend.direction === 'up') return <ArrowUpOutlined style={{ fontSize: 11 }} />;
    if (trend.direction === 'down') return <ArrowDownOutlined style={{ fontSize: 11 }} />;
    return <MinusOutlined style={{ fontSize: 11 }} />;
  };

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className={`card-modern ${onClick ? 'card-modern-hover' : ''}`}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      styles={{ body: { padding: '20px 22px' } }}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {title}
                </Text>
                {tooltip && (
                  <Tooltip title={tooltip}>
                    <InfoCircleOutlined style={{ fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                )}
              </div>

              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: 'var(--color-text)',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
                }}
              >
                {value}
              </div>

              {subtitle && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, fontWeight: 500 }}>
                  {subtitle}
                </div>
              )}
            </div>

            {icon && (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text)',
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
            )}
          </div>

          {trend && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 14,
                padding: '2px 8px',
                borderRadius: 6,
                background: `${getTrendColor()}15`,
                border: `1px solid ${getTrendColor()}30`,
              }}
            >
              <span style={{ color: getTrendColor(), display: 'flex', alignItems: 'center' }}>
                {renderTrendIcon()}
              </span>
              <span style={{ fontSize: 12, color: getTrendColor(), fontWeight: 700 }}>
                {Math.abs(trend.value).toFixed(1)}%
              </span>
              {trend.label && (
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginLeft: 2 }}>{trend.label}</span>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
