import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Select, Space, Table, Progress, Tooltip, Button, Badge, Empty, message } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, RiseOutlined, WarningOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader }              from '@/components/common/PageHeader';
import { StatCard }                from '@/components/common/StatCard';
import { ResponseTimeChart }       from '@/components/charts/ResponseTimeChart';
import { RequestVolumeChart }      from '@/components/charts/RequestVolumeChart';
import { StatusBadge }             from '@/components/common/StatusBadge';
import { HttpMethodTag }           from '@/components/common/HttpMethodTag';
import { formatResponseTime, fromNow } from '@/utils';
import { endpointsService }        from '@/services/endpoints/endpoints';
import { monitoringService }       from '@/services/endpoints/monitoring';
import type { MetricPoint, Endpoint, DashboardStats } from '@/types';

export default function MonitoringPage() {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rtData, setRtData] = useState<MetricPoint[]>([]);
  const [rvData, setRvData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<'1m' | '5m' | '15m' | '1h' | '6h' | '24h'>('1h');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadMonitoringData = useCallback(async () => {
    setLoading(true);
    try {
      const [epRes, statsRes, tsRes] = await Promise.all([
        endpointsService.list({ pageSize: 100 }).catch(() => ({ data: [] })),
        monitoringService.getDashboardStats().catch(() => null),
        monitoringService.getOverviewTimeseries({ interval }).catch(() => ({ responseTime: [], requestVolume: [] })),
      ]);

      setEndpoints(epRes.data || []);
      if (statsRes) setStats(statsRes);
      if (tsRes) {
        setRtData(tsRes.responseTime || []);
        setRvData(tsRes.requestVolume || []);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      message.error('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, [interval]);

  useEffect(() => {
    loadMonitoringData();
  }, [loadMonitoringData]);

  const rtColor = (ms: number) =>
    ms === 0 ? '#94a3b8' : ms > 500 ? '#ef4444' : ms > 200 ? '#f59e0b' : '#22c55e';

  const healthyCount = endpoints.filter((e) => e.status === 'healthy').length;
  const degradedCount = endpoints.filter((e) => e.status === 'degraded').length;
  const downCount = endpoints.filter((e) => e.status === 'down').length;
  const activeIssues = degradedCount + downCount;

  const avgUptime = endpoints.length > 0
    ? Number((endpoints.reduce((acc, e) => acc + (e.uptime || 100), 0) / endpoints.length).toFixed(1))
    : 100;

  const avgResponseTime = endpoints.length > 0
    ? Math.round(endpoints.reduce((acc, e) => acc + (e.responseTimeP50 || 0), 0) / endpoints.length)
    : 0;

  const columns = [
    {
      title: 'Endpoint',
      key: 'endpoint',
      render: (_: unknown, r: Endpoint) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background:
                r.status === 'healthy'
                  ? '#22c55e'
                  : r.status === 'degraded'
                  ? '#f59e0b'
                  : '#ef4444',
              boxShadow: `0 0 6px ${
                r.status === 'healthy'
                  ? '#22c55e'
                  : r.status === 'degraded'
                  ? '#f59e0b'
                  : '#ef4444'
              }`,
              flexShrink: 0,
            }}
          />
          <HttpMethodTag method={r.method} size="sm" />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
            {r.path}
          </span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: Endpoint['status']) => <StatusBadge status={s} />,
    },
    {
      title: 'Response Time',
      key: 'rt',
      width: 180,
      render: (_: unknown, r: Endpoint) => (
        <Space size={4}>
          <Tooltip title="P50">
            <span style={{ fontSize: 12, color: rtColor(r.responseTimeP50 || 0) }}>
              P50: {formatResponseTime(r.responseTimeP50 || 0)}
            </span>
          </Tooltip>
          <span style={{ color: '#e2e8f0' }}>|</span>
          <Tooltip title="P95">
            <span style={{ fontSize: 12, color: rtColor(r.responseTimeP95 || 0) }}>
              P95: {formatResponseTime(r.responseTimeP95 || 0)}
            </span>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 130,
      render: (v: number) => {
        const val = v ?? 100;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Progress
              percent={val}
              size="small"
              showInfo={false}
              strokeColor={val >= 99.5 ? '#22c55e' : val >= 98 ? '#f59e0b' : '#ef4444'}
              style={{ width: 60, margin: 0 }}
            />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{val.toFixed(1)}%</span>
          </div>
        );
      },
    },
    {
      title: 'Error %',
      dataIndex: 'errorRate',
      key: 'err',
      width: 90,
      render: (v: number) => {
        const val = v ?? 0;
        return (
          <span
            style={{
              color: val > 5 ? '#ef4444' : val > 1 ? '#f59e0b' : '#22c55e',
              fontWeight: 500,
            }}
          >
            {val.toFixed(1)}%
          </span>
        );
      },
    },
    {
      title: 'Req/Min',
      dataIndex: 'requestsPerMin',
      key: 'rpm',
      width: 90,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v ?? 0}</span>,
    },
    {
      title: 'Last Checked',
      dataIndex: 'lastChecked',
      key: 'lastChecked',
      width: 130,
      render: (v: string) => (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{v ? fromNow(v) : 'Never'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        subtitle={`Real-time health and telemetry · Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadMonitoringData} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/endpoints')}>
              Add Endpoint
            </Button>
          </Space>
        }
      />

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <StatCard
            title="Avg Uptime"
            value={endpoints.length > 0 ? `${avgUptime}%` : '100%'}
            icon={<RiseOutlined />}
            color="#22c55e"
            loading={loading}
            tooltip="Average across all registered endpoints"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Avg Latency (P50)"
            value={endpoints.length > 0 ? `${avgResponseTime}ms` : '0ms'}
            icon={<ThunderboltOutlined />}
            color="#4f8ef7"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Active Degradations / Outages"
            value={activeIssues.toString()}
            icon={<WarningOutlined />}
            color={activeIssues > 0 ? '#ef4444' : '#22c55e'}
            loading={loading}
          />
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <ResponseTimeChart
            data={rtData}
            loading={loading}
            interval={interval}
            onIntervalChange={(v) => {
              setInterval(v as any);
            }}
            height={280}
          />
        </Col>
        <Col xs={24} lg={10}>
          <RequestVolumeChart data={rvData} loading={loading} height={280} />
        </Col>
      </Row>

      {/* Endpoint status list */}
      <Card
        title="Endpoint Status & Telemetry"
        extra={
          <Space>
            <Badge
              color="#22c55e"
              text={`${healthyCount} healthy`}
            />
            <Badge
              color="#f59e0b"
              text={`${degradedCount} degraded`}
            />
            <Badge
              color="#ef4444"
              text={`${downCount} down`}
            />
          </Space>
        }
      >
        {endpoints.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No endpoints are currently being monitored. Add endpoints to your projects to start real-time telemetry."
            style={{ padding: '36px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/endpoints')}>
              Create Your First Endpoint
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={endpoints}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            rowClassName={(r) => (r.status === 'down' ? 'ant-table-row-danger' : '')}
          />
        )}
      </Card>
    </div>
  );
}
