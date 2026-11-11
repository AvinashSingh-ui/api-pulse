import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, Select, Empty } from 'antd';
import dayjs from 'dayjs';
import type { MetricPoint } from '@/types';
import { formatNumber } from '@/utils';

interface RequestVolumeChartProps {
  data: MetricPoint[];
  loading?: boolean;
  onIntervalChange?: (v: string) => void;
  interval?: string;
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: '#64748b', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#0f172a', fontWeight: 600, margin: 0 }}>{formatNumber(payload[0].value)} req</p>
    </div>
  );
};

export const RequestVolumeChart: React.FC<RequestVolumeChartProps> = ({
  data, loading = false, onIntervalChange, interval = '1h', height = 240,
}) => {
  const formatted = data.map(d => ({
    time: dayjs(d.timestamp).format('HH:mm'),
    value: Math.round(d.value),
  }));

  return (
    <Card
      title="Request Volume"
      loading={loading}
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
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#4f8ef7" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

