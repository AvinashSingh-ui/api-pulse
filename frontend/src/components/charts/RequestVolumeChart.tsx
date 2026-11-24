import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, Select, Empty } from 'antd';
import dayjs from 'dayjs';
import type { MetricPoint } from '@/types';
import { formatNumber } from '@/utils';
import { useTheme } from '@/hooks/useTheme';

interface RequestVolumeChartProps {
  data: MetricPoint[];
  loading?: boolean;
  onIntervalChange?: (v: string) => void;
  interval?: string;
  height?: number;
}

const CustomTooltip = ({ active, payload, label, isDark }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; isDark?: boolean }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: isDark ? '#18181b' : '#ffffff',
      border: `1px solid ${isDark ? '#27272a' : '#e2e8f0'}`,
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.07)',
      fontSize: 12,
    }}>
      <p style={{ color: isDark ? '#a1a1aa' : '#64748b', margin: '0 0 4px', fontSize: 11, fontWeight: 500 }}>{label}</p>
      <p style={{ color: isDark ? '#f4f4f5' : '#09090b', fontWeight: 700, margin: 0, fontSize: 13 }}>
        {formatNumber(payload[0].value)} req
      </p>
    </div>
  );
};

export const RequestVolumeChart: React.FC<RequestVolumeChartProps> = ({
  data, loading = false, onIntervalChange, interval = '1h', height = 240,
}) => {
  const { isDark } = useTheme();
  const formatted = data.map(d => ({
    time: dayjs(d.timestamp).format('HH:mm'),
    value: Math.round(d.value),
  }));

  const barColor = isDark ? '#71717a' : '#27272a';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
  const tickColor = isDark ? '#a1a1aa' : '#71717a';

  return (
    <Card
      title="Request Volume"
      loading={loading}
      className="card-modern"
      extra={onIntervalChange && (
        <Select size="small" value={interval} onChange={onIntervalChange} style={{ width: 80 }}
          options={[
            { label: '1h', value: '1h' }, { label: '6h', value: '6h' },
            { label: '24h', value: '24h' }, { label: '7d', value: '7d' },
          ]}
        />
      )}
      styles={{ body: { paddingTop: 8 } }}
    >
      {!loading && (!data.length || data.every(d => d.value === 0)) ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No request volume data recorded yet" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={formatted} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip isDark={isDark} />} />
            <Bar dataKey="value" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

