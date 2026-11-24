import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Button, Empty, Space, Tabs, Badge, Progress, Typography } from 'antd';
import {
  FolderOutlined, ApiOutlined, RiseOutlined, ThunderboltOutlined,
  BellOutlined, BarChartOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, PlusOutlined, HistoryOutlined, SafetyCertificateOutlined,
  AlertOutlined, ArrowRightOutlined,
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
import { useGetNotificationsQuery } from '@/services/apiSlice';
import type { Alert, Endpoint, MetricPoint, DashboardStats, AppNotification } from '@/types';

const { Text } = Typography;

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
          endpointsService.list({ pageSize: 8 }).catch(() => ({ data: [] })),
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
    const timer = setInterval(() => {
      loadData();
    }, 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const totalProjects = stats?.totalProjects ?? 0;
  const totalEndpoints = stats?.totalEndpoints ?? 0;
  const healthyEndpoints = stats?.healthyEndpoints ?? 0;
  const degradedEndpoints = stats?.degradedEndpoints ?? 0;
  const downEndpoints = stats?.downEndpoints ?? 0;
  const recoveredEndpoints = stats?.recoveredEndpoints ?? 0;
  const activeAlerts = stats?.activeAlerts ?? 0;
  const avgUptime = stats?.avgUptime ?? 0;
  const avgHealthScore = stats?.avgHealthScore ?? (totalEndpoints > 0 ? 100 : 0);
  const avgAvailability = stats?.avgAvailability ?? (totalEndpoints > 0 ? Number(((healthyEndpoints / totalEndpoints) * 100).toFixed(1)) : 0);
  const avgResponseTime = stats?.avgResponseTime ?? 0;
  const requestsToday = stats?.requestsToday ?? 0;

  const { data: notificationsData } = useGetNotificationsQuery(
    { pageSize: 6 },
    { pollingInterval: 8000 }
  );
  const recentNotifications: AppNotification[] = notificationsData?.data || stats?.recentNotifications || [];

  // Status distribution only shows real status when endpoints exist
  const statusDistData = totalEndpoints > 0
    ? [
        { name: 'Healthy',  value: healthyEndpoints,  color: '#10b981' },
        { name: 'Degraded', value: degradedEndpoints, color: '#f59e0b' },
        { name: 'Down',     value: downEndpoints,     color: '#f43f5e' },
      ].filter(d => d.value > 0)
    : [];

  const notificationColumns = [
    {
      title: 'Health Incident Notification',
      key: 'title',
      render: (_: unknown, record: AppNotification) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {record.severity === 'critical' ? (
            <CloseCircleOutlined style={{ color: '#f43f5e', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          ) : record.severity === 'warning' ? (
            <ExclamationCircleOutlined style={{ color: '#f59e0b', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          ) : (
            <CheckCircleOutlined style={{ color: '#10b981', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>{record.title}</span>
              {!record.isRead && (
                <Tag color="error" style={{ fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 6, fontWeight: 700 }}>
                  NEW
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>{record.message}</div>
            {record.endpointPath && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {record.method && <HttpMethodTag method={record.method} size="sm" />}
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--color-text)', fontWeight: 600 }}>
                  {record.endpointPath}
                </span>
                {record.metadata?.statusCode && (
                  <Tag
                    color={record.metadata.statusCode >= 500 ? 'error' : record.metadata.statusCode >= 400 ? 'warning' : 'success'}
                    style={{ fontSize: 11, padding: '0 6px', margin: 0, fontWeight: 700 }}
                  >
                    HTTP {record.metadata.statusCode}
                  </Tag>
                )}
                {record.metadata?.responseTime !== undefined && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    {record.metadata.responseTime}ms
                  </span>
                )}
                {record.metadata?.failureReason && (
                  <span style={{ fontSize: 12, color: '#f43f5e', fontWeight: 600 }}>
                    ({record.metadata.failureReason})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (s: string) => {
        const color = s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'success';
        return <Tag color={color} style={{ fontWeight: 700 }}>{s.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 100,
      render: (t: string) => (
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {fromNow(t)}
        </span>
      ),
    },
  ];

  const alertColumns = [
    {
      title: 'Alert Rule',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Alert) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{text}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {fromNow(record.triggeredAt)}
          </div>
        </div>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (s: Alert['severity']) => <SeverityBadge severity={s} />,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: Alert['status']) => (
        <Tag color={s === 'active' ? 'error' : s === 'acknowledged' ? 'warning' : 'success'} style={{ fontWeight: 700 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HttpMethodTag method={r.method} size="sm" />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--color-text)', fontWeight: 600 }}>
            {r.path}
          </span>
        </div>
      ),
    },
    {
      title: 'Req/min',
      dataIndex: 'requestsPerMin',
      key: 'rpm',
      width: 100,
      render: (v: number) => <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{formatNumber(v || 0)}</span>,
    },
    {
      title: 'P95 Latency',
      dataIndex: 'responseTimeP95',
      key: 'p95',
      width: 110,
      render: (v: number) => (
        <span style={{ color: (v || 0) > 500 ? '#f43f5e' : (v || 0) > 200 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
          {formatResponseTime(v || 0)}
        </span>
      ),
    },
    {
      title: 'Error %',
      dataIndex: 'errorRate',
      key: 'err',
      width: 100,
      render: (v: number) => (
        <span style={{ color: (v || 0) > 5 ? '#f43f5e' : (v || 0) > 1 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
          {(v || 0).toFixed(1)}%
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_: unknown, r: Endpoint) => {
        const color = r.status === 'healthy' ? '#10b981' : r.status === 'degraded' ? '#f59e0b' : '#f43f5e';
        return (
          <Tag color={r.status === 'healthy' ? 'success' : r.status === 'degraded' ? 'warning' : 'error'} style={{ fontWeight: 700 }}>
            {(r.status || 'HEALTHY').toUpperCase()}
          </Tag>
        );
      },
    },
  ];

  const hasOutages = downEndpoints > 0;
  const hasDegraded = degradedEndpoints > 0;

  return (
    <div>
      <PageHeader
        title="Command Center"
        subtitle="Real-time telemetry, live API availability scoring, and automated synthetic verification"
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <Space size={10}>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => navigate('/projects?tab=history')}
              style={{ borderRadius: 10 }}
            >
              Project History
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => navigate('/projects')}
              style={{ borderRadius: 10 }}
            >
              Add Project
            </Button>
            <Button
              type="primary"
              className="btn-primary-gradient"
              icon={<ThunderboltOutlined />}
              onClick={() => navigate('/monitoring')}
            >
              Live Telemetry
            </Button>
          </Space>
        }
      />

      {/* Meaningful empty-state card when zero active projects exist */}
      {!loading && totalProjects === 0 && (
        <Card
          className="card-modern"
          style={{
            marginBottom: 24,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-tertiary)',
          }}
          styles={{ body: { padding: '28px 32px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: 'var(--color-text)' }}>
                Welcome to API Pulse Command Center
              </h3>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
                No active API projects configured yet. Connect your microservices or deployed endpoints to start receiving real-time observability telemetry.
              </p>
            </div>
            <Space size={12}>
              <Button
                icon={<HistoryOutlined />}
                onClick={() => navigate('/projects?tab=history')}
                style={{ borderRadius: 10 }}
              >
                View Project History
              </Button>
              <Button
                type="primary"
                className="btn-primary-gradient"
                icon={<PlusOutlined />}
                onClick={() => navigate('/projects')}
              >
                Create First Project
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Executive System Health Status Banner */}
      <Card
        className="card-modern"
        style={{
          marginBottom: 24,
          background: 'var(--color-bg-secondary)',
          position: 'relative',
          overflow: 'hidden',
        }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          {/* Status summary */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="live-dot-pulse" style={{ backgroundColor: hasOutages ? '#f43f5e' : hasDegraded ? '#f59e0b' : '#10b981' }} />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  color: hasOutages ? '#f43f5e' : hasDegraded ? '#d97706' : '#059669',
                }}
              >
                {totalEndpoints === 0
                  ? 'Awaiting Endpoint Registration'
                  : hasOutages
                  ? `${downEndpoints} Service Outage Detected`
                  : hasDegraded
                  ? `${degradedEndpoints} Endpoints Experiencing High Latency`
                  : 'All Systems Fully Operational'}
              </span>
              <Tag
                color={hasOutages ? 'error' : hasDegraded ? 'warning' : 'success'}
                style={{ borderRadius: 6, fontWeight: 700 }}
              >
                {totalEndpoints > 0 ? `${avgAvailability}% UPTIME` : 'IDLE'}
              </Tag>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{healthyEndpoints}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Healthy</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{degradedEndpoints}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Degraded</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{downEndpoints}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Outages</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{recoveredEndpoints}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Auto-Resolved (24h)</span>
              </div>
            </div>
          </div>

          {/* Health Score Gauge / Visual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Global Health Score
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                {totalEndpoints > 0 ? `${avgHealthScore}` : '0'}<span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>/100</span>
              </div>
            </div>
            <Progress
              type="circle"
              percent={totalEndpoints > 0 ? avgHealthScore : 0}
              size={56}
              strokeWidth={8}
              strokeColor={{
                '0%': 'var(--color-primary)',
                '100%': avgHealthScore >= 90 ? '#10b981' : avgHealthScore >= 50 ? '#f59e0b' : '#ef4444',
              }}
              format={percent => (
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text)' }}>
                  {percent}%
                </span>
              )}
            />
          </div>
        </div>
      </Card>

      {/* 4 Focused Core KPI Cards (Clean, Spacious, Not Crowded) */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Avg Availability"
            value={totalEndpoints > 0 ? `${avgAvailability}%` : 'N/A'}
            icon={<CheckCircleOutlined />}
            color="#10b981"
            subtitle={totalEndpoints > 0 ? `${healthyEndpoints} of ${totalEndpoints} routes healthy` : 'No routes registered'}
            loading={loading}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="P50 Latency"
            value={totalEndpoints > 0 ? `${avgResponseTime}ms` : 'N/A'}
            icon={<ThunderboltOutlined />}
            color="#f59e0b"
            subtitle={totalEndpoints > 0 ? 'Global median response time' : 'Awaiting live traffic'}
            loading={loading}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Monitored Endpoints"
            value={totalEndpoints.toString()}
            icon={<ApiOutlined />}
            color="#71717a"
            subtitle={`${totalProjects} active microservice projects`}
            loading={loading}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active Incidents"
            value={(downEndpoints + degradedEndpoints + activeAlerts).toString()}
            icon={<AlertOutlined />}
            color={downEndpoints > 0 ? '#f43f5e' : degradedEndpoints > 0 ? '#f59e0b' : '#10b981'}
            subtitle={
              downEndpoints > 0
                ? `${downEndpoints} active outages`
                : degradedEndpoints > 0
                ? `${degradedEndpoints} high latency warnings`
                : 'All endpoints performing optimally'
            }
            loading={loading}
          />
        </Col>
      </Row>

      {/* Charts Row: Latency Telemetry & Status Distribution */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <ResponseTimeChart data={rtData} loading={loading} />
        </Col>
        <Col xs={24} lg={8}>
          <StatusDistributionChart data={statusDistData} loading={loading} />
        </Col>
      </Row>

      {/* Telemetry Observability & Incident Activity Cards */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <RequestVolumeChart data={rvData} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <Card
            className="card-modern"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BellOutlined style={{ color: 'var(--color-text)', fontSize: 16 }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>Real-Time Health Incidents & Alerts</span>
              </div>
            }
            loading={loading}
            extra={
              <Button
                type="link"
                onClick={() => navigate('/alerts')}
                style={{ padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}
              >
                Alerts Center <ArrowRightOutlined style={{ fontSize: 11 }} />
              </Button>
            }
            styles={{ body: { padding: '12px 20px 20px' } }}
          >
            <Tabs
              defaultActiveKey="notifications"
              items={[
                {
                  key: 'notifications',
                  label: (
                    <span style={{ fontWeight: 600 }}>
                      Live Health Feed
                      {recentNotifications.filter(n => !n.isRead).length > 0 && (
                        <Badge
                          count={recentNotifications.filter(n => !n.isRead).length}
                          style={{ marginLeft: 6, backgroundColor: '#f43f5e' }}
                        />
                      )}
                    </span>
                  ),
                  children: recentNotifications.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No active health alerts. All monitored endpoints are healthy."
                      style={{ padding: '32px 0' }}
                    />
                  ) : (
                    <Table
                      dataSource={recentNotifications}
                      columns={notificationColumns}
                      rowKey="id"
                      pagination={false}
                      size="middle"
                      scroll={{ x: 450 }}
                      onRow={(record) => ({
                        onClick: () => {
                          if (record.endpointId) {
                            navigate(`/endpoints/${record.endpointId}`);
                          } else {
                            navigate('/alerts');
                          }
                        },
                        style: { cursor: 'pointer' },
                      })}
                    />
                  ),
                },
                {
                  key: 'alerts',
                  label: <span style={{ fontWeight: 600 }}>Rule Breaches ({alerts.length})</span>,
                  children: alerts.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No active alert rule breaches recorded"
                      style={{ padding: '32px 0' }}
                    />
                  ) : (
                    <Table
                      dataSource={alerts}
                      columns={alertColumns}
                      rowKey="id"
                      pagination={false}
                      size="middle"
                      scroll={{ x: 450 }}
                      onRow={() => ({ onClick: () => navigate('/alerts'), style: { cursor: 'pointer' } })}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Top Endpoints by Traffic */}
      <Card
        className="card-modern"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ApiOutlined style={{ color: 'var(--color-text)', fontSize: 16 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Monitored Endpoints Telemetry</span>
          </div>
        }
        extra={
          <Button
            type="link"
            onClick={() => navigate('/endpoints')}
            style={{ padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}
          >
            Manage Endpoints <ArrowRightOutlined style={{ fontSize: 11 }} />
          </Button>
        }
        loading={loading}
        styles={{ body: { padding: '8px 20px 20px' } }}
      >
        {endpoints.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No active endpoints configured yet. Add endpoints to start tracking live metrics."
            style={{ padding: '32px 0' }}
          >
            <Button
              type="primary"
              className="btn-primary-gradient"
              onClick={() => navigate('/endpoints')}
            >
              Add Your First Endpoint
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={[...endpoints].sort((a, b) => (b.requestsPerMin || 0) - (a.requestsPerMin || 0))}
            columns={endpointColumns}
            rowKey="id"
            pagination={false}
            size="middle"
            scroll={{ x: 600 }}
            onRow={(r) => ({
              onClick: () => navigate(`/endpoints/${r.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>
    </div>
  );
}
