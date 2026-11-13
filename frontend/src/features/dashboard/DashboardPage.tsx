import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Button, Alert as AntAlert, Empty, Spin } from 'antd';
import {
  FolderOutlined, ApiOutlined, RiseOutlined, ThunderboltOutlined,
  BellOutlined, BarChartOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader }              from '@/components/common/PageHeader';
import { StatCard }                from '@/components/common/StatCard';
import { ResponseTimeChart }       from '@/components/charts/ResponseTimeChart';
import { RequestVolumeChart }      from '@/components/charts/RequestVolumeChart';
import { StatusDistributionChart } from '@/components/charts/StatusDistributionChart';
import { SeverityBadge }           from '@/components/common/StatusBadge';
import { HttpMethodTag }           from '@/components/common/HttpMethodTag';
import { formatResponseTime, formatNumber, fromNow } from '@/utils';
import { monitoringService }       from '@/services/endpoints/monitoring';
import { alertsService }           from '@/services/endpoints/alerts';
import { endpointsService }        from '@/services/endpoints/endpoints';
import type { Alert, Endpoint, MetricPoint, DashboardStats } from '@/types';

/**
 * DashboardPage:
 * - Serves as the central command center for API Pulse.
 * - Beginner-Friendly Architecture:
 *   1. Parallel Data Fetching: Loads stats, alerts, endpoints, and timeseries data simultaneously using Promise.all.
 *   2. Safe State Updates: Uses a `mounted` boolean flag in `useEffect` to prevent React state updates if the user navigates away early.
 *   3. Responsive Ant Design Tables: Tables include `scroll={{ x: 500 }}` so they scroll cleanly on mobile devices without layout overflow.
 *   4. Reusable Stat Cards: Summary statistics are mapped into Ant Design Grid <Row> and <Col> components.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [rtData, setRtData] = useState<MetricPoint[]>([]);
  const [rvData, setRvData] = useState<MetricPoint[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [statsRes, alertsRes, endpointsRes, timeseriesRes] = await Promise.all([
          monitoringService.getDashboardStats().catch(() => null),
          alertsService.list({ pageSize: 5 }).catch(() => ({ data: [] })),
          endpointsService.list({ pageSize: 5 }).catch(() => ({ data: [] })),
          monitoringService.getOverviewTimeseries().catch(() => ({ responseTime: [], requestVolume: [] })),
        ]);

        if (!mounted) return;

        if (statsRes) {
          setStats(statsRes);
        }
        if (alertsRes && alertsRes.data) {
          setAlerts(alertsRes.data);
        }
        if (endpointsRes && endpointsRes.data) {
          setEndpoints(endpointsRes.data);
        }
        if (timeseriesRes) {
          setRtData(timeseriesRes.responseTime || []);
          setRvData(timeseriesRes.requestVolume || []);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const totalProjects = stats?.totalProjects ?? 0;
  const totalEndpoints = stats?.totalEndpoints ?? 0;
  const healthyEndpoints = stats?.healthyEndpoints ?? 0;
  const degradedEndpoints = stats?.degradedEndpoints ?? 0;
  const downEndpoints = stats?.downEndpoints ?? 0;
  const activeAlerts = stats?.activeAlerts ?? 0;
  const avgUptime = stats?.avgUptime ?? 100;
  const avgResponseTime = stats?.avgResponseTime ?? 0;
  const requestsToday = stats?.requestsToday ?? 0;
  const errorRateToday = stats?.errorRateToday ?? 0;

  const statusDistData = totalEndpoints > 0
    ? [
        { name: 'Healthy',  value: healthyEndpoints,  color: '#22c55e' },
        { name: 'Degraded', value: degradedEndpoints, color: '#f59e0b' },
        { name: 'Down',     value: downEndpoints,     color: '#ef4444' },
      ].filter(d => d.value > 0)
    : [{ name: 'No Endpoints', value: 1, color: '#e2e8f0' }];

  const alertColumns = [
    {
      title: 'Alert',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Alert) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>{text}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            {fromNow(record.triggeredAt)}
          </div>
        </div>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (s: Alert['severity']) => <SeverityBadge severity={s} />,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: Alert['status']) => (
        <Tag color={s === 'active' ? 'error' : s === 'acknowledged' ? 'warning' : 'success'}>
          {s?.toUpperCase()}
        </Tag>
      ),
    },
  ];

  const endpointColumns = [
    {
      title: 'Endpoint',
      key: 'endpoint',
      render: (_: unknown, r: Endpoint) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HttpMethodTag method={r.method} size="sm" />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#475569' }}>
            {r.path}
          </span>
        </div>
      ),
    },
    {
      title: 'Req/min',
      dataIndex: 'requestsPerMin',
      key: 'rpm',
      width: 90,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{formatNumber(v || 0)}</span>,
    },
    {
      title: 'P95',
      dataIndex: 'responseTimeP95',
      key: 'p95',
      width: 90,
      render: (v: number) => (
        <span style={{ color: (v || 0) > 500 ? '#ef4444' : (v || 0) > 200 ? '#f59e0b' : '#22c55e', fontWeight: 500 }}>
          {formatResponseTime(v || 0)}
        </span>
      ),
    },
    {
      title: 'Error %',
      dataIndex: 'errorRate',
      key: 'err',
      width: 90,
      render: (v: number) => (
        <span style={{ color: (v || 0) > 5 ? '#ef4444' : (v || 0) > 1 ? '#f59e0b' : '#22c55e', fontWeight: 500 }}>
          {(v || 0).toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time overview of all your API projects"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/projects')}>
              Add Project
            </Button>
            <Button type="primary" onClick={() => navigate('/monitoring')}>
              Live Monitor
            </Button>
          </div>
        }
      />

      {/* Onboarding Banner when no projects exist */}
      {!loading && totalProjects === 0 && (
        <AntAlert
          message="Welcome to API Pulse"
          description="All monitoring engines are online. You don't have any projects yet. Create your first project to begin tracking real-time API telemetry, latency, and automated alerts."
          type="info"
          showIcon
          action={
            <Button type="primary" size="small" onClick={() => navigate('/projects')}>
              Create Your First Project
            </Button>
          }
          style={{ marginBottom: 24, borderRadius: 8, border: '1px solid #bae0ff' }}
        />
      )}

      {/* Stat Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'Total Projects',
            value: totalProjects.toString(),
            icon: <FolderOutlined />,
            color: '#4f8ef7',
          },
          {
            title: 'Total Endpoints',
            value: totalEndpoints.toString(),
            icon: <ApiOutlined />,
            color: '#7c5cfc',
          },
          {
            title: 'Avg Uptime',
            value: totalEndpoints > 0 ? `${avgUptime}%` : '100%',
            icon: <RiseOutlined />,
            color: '#22c55e',
          },
          {
            title: 'Avg Response Time',
            value: totalEndpoints > 0 ? `${avgResponseTime}ms` : '0ms',
            icon: <ThunderboltOutlined />,
            color: '#f59e0b',
          },
          {
            title: 'Active Alerts',
            value: activeAlerts.toString(),
            icon: <BellOutlined />,
            color: activeAlerts > 0 ? '#ef4444' : '#22c55e',
          },
          {
            title: 'Requests Logged',
            value: formatNumber(requestsToday),
            icon: <BarChartOutlined />,
            color: '#00d4aa',
          },
          {
            title: 'Error Rate',
            value: `${errorRateToday.toFixed(1)}%`,
            icon: <ExclamationCircleOutlined />,
            color: errorRateToday > 5 ? '#ef4444' : errorRateToday > 1 ? '#f97316' : '#22c55e',
          },
          {
            title: 'Healthy Endpoints',
            value: `${healthyEndpoints}/${totalEndpoints}`,
            icon: <CheckCircleOutlined />,
            color: '#22c55e',
          },
        ].map((s, i) => (
          <Col key={i} xs={24} sm={12} md={8} lg={6}>
            <StatCard
              title={s.title}
              value={s.value}
              icon={s.icon}
              color={s.color}
              loading={loading}
            />
          </Col>
        ))}
      </Row>

      {/* Charts Row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <ResponseTimeChart data={rtData} loading={loading} />
        </Col>
        <Col xs={24} lg={8}>
          <StatusDistributionChart data={statusDistData} loading={loading} />
        </Col>
      </Row>

      {/* Charts Row 2 + Recent Alerts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <RequestVolumeChart data={rvData} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Recent Alerts"
            loading={loading}
            extra={
              <Button
                type="link"
                onClick={() => navigate('/alerts')}
                style={{ padding: 0, fontSize: 13 }}
              >
                View all
              </Button>
            }
          >
            {alerts.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No active alerts recorded"
                style={{ padding: '24px 0' }}
              />
            ) : (
              <Table
                dataSource={alerts}
                columns={alertColumns}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 500 }}
                onRow={() => ({ onClick: () => navigate('/alerts'), style: { cursor: 'pointer' } })}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Top Endpoints */}
      <Card
        title="Top Endpoints by Traffic"
        extra={
          <Button
            type="link"
            onClick={() => navigate('/endpoints')}
            style={{ padding: 0, fontSize: 13 }}
          >
            View all
          </Button>
        }
        loading={loading}
      >
        {endpoints.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No endpoints configured yet. Add endpoints to your projects to start tracking traffic."
            style={{ padding: '24px 0' }}
          >
            <Button type="primary" size="small" onClick={() => navigate('/endpoints')}>
              Go to Endpoints
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={[...endpoints].sort((a, b) => (b.requestsPerMin || 0) - (a.requestsPerMin || 0))}
            columns={endpointColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 500 }}
          />
        )}
      </Card>
    </div>
  );
}
