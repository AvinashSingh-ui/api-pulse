import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, Empty } from 'antd';

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
  const hasRealData = data.some(d => d.value > 0 && d.name !== 'No Endpoints');

  return (
    <Card title={title} loading={loading} styles={{ body: { paddingTop: 8 } }}>
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
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [value, name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

