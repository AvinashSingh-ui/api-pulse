import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, Empty } from 'antd';
import { useTheme } from '@/hooks/useTheme';

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface StatusDistributionChartProps {
  data: StatusData[];
  loading?: boolean;
  height?: number;
  title?: string;
}

export const StatusDistributionChart: React.FC<StatusDistributionChartProps> = ({
  data, loading = false, height = 240, title = 'Status Distribution',
}) => {
  const { isDark } = useTheme();
  const hasRealData = data.some(d => d.value > 0 && d.name !== 'No Endpoints');

  return (
    <Card title={title} loading={loading} className="card-modern" styles={{ body: { paddingTop: 8 } }}>
      {!hasRealData && !loading ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No endpoints registered" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
              stroke={isDark ? '#121215' : '#ffffff'}
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`${value} routes`, name]}
              contentStyle={{
                backgroundColor: isDark ? '#18181b' : '#ffffff',
                borderColor: isDark ? '#27272a' : '#e2e8f0',
                borderRadius: 8,
                fontSize: 12,
                color: isDark ? '#f4f4f5' : '#09090b',
                boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.07)',
              }}
              itemStyle={{ color: isDark ? '#f4f4f5' : '#09090b', fontWeight: 600 }}
              labelStyle={{ color: isDark ? '#a1a1aa' : '#64748b' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: isDark ? '#a1a1aa' : '#52525b', paddingTop: 8 }}
              formatter={(value) => <span style={{ color: isDark ? '#d4d4d8' : '#3f3f46', fontWeight: 500, fontSize: 12 }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

