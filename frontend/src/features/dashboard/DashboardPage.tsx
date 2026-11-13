import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Button, Empty, Space, Tabs, Badge } from 'antd';
import {
  FolderOutlined, ApiOutlined, RiseOutlined, ThunderboltOutlined,
  BellOutlined, BarChartOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, PlusOutlined, HistoryOutlined, SafetyCertificateOutlined,
  AlertOutlined,
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

/**
 * DashboardPage:
 * - Real-time command center for API Pulse.
 * - Guarantees data consistency: All metrics are computed strictly from active database records.
 * - Shows appropriate empty states (N/A / 0) when no active projects or endpoints exist.
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
  const recoveredEndpoints = stats?.recoveredEndpoints ?? 0;
  const activeAlerts = stats?.activeAlerts ?? 0;
  const avgUptime = stats?.avgUptime ?? 0;
  const avgHealthScore = stats?.avgHealthScore ?? (totalEndpoints > 0 ? 100 : 0);
  const avgAvailability = stats?.avgAvailability ?? (totalEndpoints > 0 ? Number(((healthyEndpoints / totalEndpoints) * 100).toFixed(1)) : 0);
  const avgResponseTime = stats?.avgResponseTime ?? 0;
  const requestsToday = stats?.requestsToday ?? 0;
  const errorRateToday = stats?.errorRateToday ?? 0;

  const { data: notificationsData } = useGetNotificationsQuery(
    { pageSize: 5 },
    { pollingInterval: 8000 }
  );
  const recentNotifications: AppNotification[] = notificationsData?.data || stats?.recentNotifications || [];

  // Status distribution only shows real status when endpoints exist
  const statusDistData = totalEndpoints > 0
    ? [
        { name: 'Healthy',  value: healthyEndpoints,  color: '#22c55e' },
        { name: 'Degraded', value: degradedEndpoints, color: '#f59e0b' },
        { name: 'Down',     value: downEndpoints,     color: '#ef4444' },
      ].filter(d => d.value > 0)
    : [];

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

  const notificationColumns = [
    {
      title: 'Health Incident Notification',
      key: 'title',
      render: (_: unknown, record: AppNotification) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {record.severity === 'critical' ? (
            <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          ) : record.severity === 'warning' ? (
            <ExclamationCircleOutlined style={{ color: '#f59e0b', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          ) : (
            <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{record.title}</span>
              {!record.isRead && (
                <Tag color="processing" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>
                  NEW
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{record.message}</div>
            {record.endpointPath && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {record.method && <HttpMethodTag method={record.method} size="sm" />}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0958d9', fontWeight: 600 }}>
                  {record.endpointPath}
                </span>
                {record.metadata?.statusCode && (
                  <Tag color={record.metadata.statusCode >= 500 ? 'red' : record.metadata.statusCode >= 400 ? 'orange' : 'green'} style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                    HTTP {record.metadata.statusCode}
                  </Tag>
                )}
                {record.metadata?.responseTime !== undefined && (
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {record.metadata.responseTime}ms
                  </span>
                )}
                {record.metadata?.failureReason && (
                  <span style={{ fontSize: 11, color: '#dc2626' }}>
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
      width: 90,
      render: (s: string) => {
        const color = s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'success';
        return <Tag color={color}>{s.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 90,
      render: (t: string) => (
        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {fromNow(t)}
        </span>
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
        subtitle="Real-time overview of all active API projects and live telemetry"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<HistoryOutlined />} onClick={() => navigate('/projects?tab=history')}>
              Project History
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/projects')}>
              Add Project
            </Button>
            <Button type="primary" onClick={() => navigate('/monitoring')}>
              Live Monitor
            </Button>
          </div>
        }
      />

      {/* Meaningful empty-state card when zero active projects exist */}
      {!loading && totalProjects === 0 && (
        <Card
          style={{
            marginBottom: 24,
            borderRadius: 12,
            border: '1px solid #bae0ff',
            background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%)',
          }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0958d9' }}>
                No active projects yet
              </h3>
              <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>
                No active projects yet. Create your first project to start monitoring API performance.
              </p>
            </div>
            <Space size={10}>
              <Button
                icon={<HistoryOutlined />}
                onClick={() => navigate('/projects?tab=history')}
                style={{ borderRadius: 8 }}
              >
                View Project History
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/projects')}
                style={{ borderRadius: 8 }}
              >
                Create Your First Project
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Intelligent Health & Alerts Incident Status */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Unhealthy APIs</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: downEndpoints > 0 ? '#ef4444' : '#0f172a', marginTop: 2 }}>
              {downEndpoints}
            </div>
            <div style={{ fontSize: 11, color: downEndpoints > 0 ? '#ef4444' : '#94a3b8' }}>
              {downEndpoints > 0 ? 'Outages / 5xx errors' : '0 outages detected'}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Degraded APIs</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: degradedEndpoints > 0 ? '#f59e0b' : '#0f172a', marginTop: 2 }}>
              {degradedEndpoints}
            </div>
            <div style={{ fontSize: 11, color: degradedEndpoints > 0 ? '#f59e0b' : '#94a3b8' }}>
              {degradedEndpoints > 0 ? 'High latency / slow P95' : '0 degraded endpoints'}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #22c55e' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Recovered APIs</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>
              {recoveredEndpoints}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Auto-resolved (24h)
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #6366f1' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Total Active Alerts</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: activeAlerts > 0 ? '#6366f1' : '#0f172a', marginTop: 2 }}>
              {activeAlerts}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Active rule breaches
            </div>
          </Card>
        </Col>
      </Row>

      {/* Stat Cards - Strictly computed from active database records */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'API Health Score',
            value: totalEndpoints > 0 ? `${avgHealthScore}/100` : 'N/A',
            icon: <SafetyCertificateOutlined />,
            color: avgHealthScore >= 90 ? '#22c55e' : avgHealthScore >= 50 ? '#f59e0b' : '#ef4444',
            subtitle: totalEndpoints > 0
              ? (avgHealthScore >= 90 ? 'Healthy (≥90)' : avgHealthScore >= 50 ? 'Degraded (50-89)' : 'Unhealthy (<50)')
              : 'Awaiting routes',
          },
          {
            title: 'Avg Uptime',
            value: totalEndpoints > 0 ? `${avgUptime}%` : 'N/A',
            icon: <RiseOutlined />,
            color: '#22c55e',
            subtitle: totalEndpoints > 0 ? 'Historical checks' : 'Awaiting endpoints',
          },
          {
            title: 'Availability',
            value: totalEndpoints > 0 ? `${avgAvailability}%` : 'N/A',
            icon: <CheckCircleOutlined />,
            color: avgAvailability >= 95 ? '#22c55e' : '#f59e0b',
            subtitle: totalEndpoints > 0 ? `${healthyEndpoints}/${totalEndpoints} operational` : 'No routes',
          },
          {
            title: 'Avg Response Time',
            value: totalEndpoints > 0 ? `${avgResponseTime}ms` : 'N/A',
            icon: <ThunderboltOutlined />,
            color: '#f59e0b',
            subtitle: totalEndpoints > 0 ? 'P50 median' : 'Awaiting traffic',
          },
          {
            title: 'Total Projects',
            value: totalProjects.toString(),
            icon: <FolderOutlined />,
            color: '#4f8ef7',
            subtitle: totalProjects === 0 ? 'No active projects' : `${totalProjects} active`,
          },
          {
            title: 'Total Endpoints',
            value: totalEndpoints.toString(),
            icon: <ApiOutlined />,
            color: '#7c5cfc',
            subtitle: totalEndpoints === 0 ? 'No active endpoints' : `${healthyEndpoints} healthy`,
          },
          {
            title: 'Active Alerts',
            value: totalProjects > 0 ? activeAlerts.toString() : '0',
            icon: <BellOutlined />,
            color: activeAlerts > 0 ? '#ef4444' : '#22c55e',
            subtitle: activeAlerts > 0 ? 'Requires attention' : 'All systems normal',
          },
          {
            title: 'Requests Logged',
            value: totalProjects > 0 ? formatNumber(requestsToday) : '0',
            icon: <BarChartOutlined />,
            color: '#00d4aa',
            subtitle: 'Active telemetry logs',
          },
        ].map((s, i) => (
          <Col key={i} xs={24} sm={12} md={8} lg={6}>
            <StatCard
              title={s.title}
              value={s.value}
              icon={s.icon}
              color={s.color}
              subtitle={s.subtitle}
              loading={loading}
            />
          </Col>
        ))}
      </Row>

      {/* Charts Row 1: Response Time & Status Distribution */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <ResponseTimeChart data={rtData} loading={loading} />
        </Col>
        <Col xs={24} lg={8}>
          <StatusDistributionChart data={statusDistData} loading={loading} />
        </Col>
      </Row>

      {/* Charts Row 2: Request Volume & Recent Alerts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <RequestVolumeChart data={rvData} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BellOutlined style={{ color: '#0958d9' }} />
                <span>Intelligent Health Alerts & Incidents</span>
              </div>
            }
            loading={loading}
            extra={
              <Button
                type="link"
                onClick={() => navigate('/alerts')}
                style={{ padding: 0, fontSize: 13 }}
              >
                Notification Center →
              </Button>
            }
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            <Tabs
              defaultActiveKey="notifications"
              items={[
                {
                  key: 'notifications',
                  label: (
                    <span>
                      Live Health Alerts
                      {recentNotifications.filter(n => !n.isRead).length > 0 && (
                        <Badge
                          count={recentNotifications.filter(n => !n.isRead).length}
                          style={{ marginLeft: 6, backgroundColor: '#ef4444' }}
                        />
                      )}
                    </span>
                  ),
                  children: recentNotifications.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No active health alerts. All monitored endpoints are healthy."
                      style={{ padding: '24px 0' }}
                    />
                  ) : (
                    <Table
                      dataSource={recentNotifications}
                      columns={notificationColumns}
                      rowKey="id"
                      pagination={false}
                      size="small"
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
                  label: `Rule Alerts (${alerts.length})`,
                  children: alerts.length === 0 ? (
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
            description="No active endpoints configured yet. Add endpoints to your projects to start tracking traffic."
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
