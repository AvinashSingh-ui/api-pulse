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
  color = '#4f46e5',
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
    return isGood ? '#10b981' : '#f43f5e';
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
      styles={{ body: { padding: '22px 24px' } }}
    >
      {/* Subtle top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
          opacity: 0.8,
        }}
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#64748b',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    textTransform: 'uppercase',
                  }}
                >
                  {title}
                </Text>
                {tooltip && (
                  <Tooltip title={tooltip}>
                    <InfoCircleOutlined style={{ fontSize: 12, color: '#94a3b8', cursor: 'help' }} />
                  </Tooltip>
                )}
              </div>

              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#0f172a',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
                }}
              >
                {value}
              </div>

              {subtitle && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontWeight: 500 }}>
                  {subtitle}
                </div>
              )}
            </div>

            {icon && (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: `${color}14`,
                  border: `1px solid ${color}22`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color,
                  fontSize: 22,
                  flexShrink: 0,
                  boxShadow: `0 2px 8px -2px ${color}20`,
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
                padding: '3px 8px',
                borderRadius: 6,
                background: `${getTrendColor()}10`,
                border: `1px solid ${getTrendColor()}25`,
              }}
            >
              <span style={{ color: getTrendColor(), display: 'flex', alignItems: 'center' }}>
                {renderTrendIcon()}
              </span>
              <span style={{ fontSize: 12, color: getTrendColor(), fontWeight: 700 }}>
                {Math.abs(trend.value).toFixed(1)}%
              </span>
              {trend.label && (
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 2 }}>{trend.label}</span>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
