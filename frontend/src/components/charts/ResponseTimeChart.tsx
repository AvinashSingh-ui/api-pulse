import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, Select, Empty } from 'antd';
import dayjs from 'dayjs';
import type { MetricPoint } from '@/types';
import { RESPONSE_TIME_WARN, RESPONSE_TIME_CRITICAL } from '@/constants';

interface ResponseTimeChartProps {
  data: MetricPoint[];
  loading?: boolean;
  onIntervalChange?: (interval: string) => void;
  interval?: string;
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
      fontSize: 12,
    }}>
      <p style={{ color: '#64748b', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#0f172a', fontWeight: 600, margin: 0 }}>
        {payload[0].value}ms
      </p>
    </div>
  );
};

export const ResponseTimeChart: React.FC<ResponseTimeChartProps> = ({
  data,
  loading = false,
  onIntervalChange,
  interval = '1h',
  height = 240,
}) => {
  const formatted = data.map(d => ({
    time: dayjs(d.timestamp).format('HH:mm'),
    value: Math.round(d.value),
  }));

  return (
    <Card
      title="Response Time"
      loading={loading}
      extra={
        onIntervalChange && (
          <Select
            size="small"
            value={interval}
            onChange={onIntervalChange}
            style={{ width: 80 }}
            options={[
              { label: '1h',  value: '1h'  },
              { label: '6h',  value: '6h'  },
              { label: '24h', value: '24h' },
              { label: '7d',  value: '7d'  },
            ]}
          />
        )
      }
      styles={{ body: { paddingTop: 8 } }}
    >
      {!loading && (!data.length || data.every(d => d.value === 0)) ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No response time telemetry recorded yet" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={formatted} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="rtGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#4f8ef7" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="ms" />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={RESPONSE_TIME_WARN}     stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Warn',     position: 'right', fontSize: 10, fill: '#f59e0b' }} />
          <ReferenceLine y={RESPONSE_TIME_CRITICAL} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Critical', position: 'right', fontSize: 10, fill: '#ef4444' }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#4f8ef7"
            strokeWidth={2}
            fill="url(#rtGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#4f8ef7' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      )}
    </Card>
  );
};

