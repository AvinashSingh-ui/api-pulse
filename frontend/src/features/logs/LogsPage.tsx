import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Drawer,
  Descriptions,
  Card,
  Row,
  Col,
  Empty,
  message,
} from 'antd';
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader }    from '@/components/common/PageHeader';
import { StatCard }      from '@/components/common/StatCard';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { formatBytes, formatResponseTime, formatDateTime } from '@/utils';
import { logsService }   from '@/services/endpoints/logs';
import type { RequestLog, HttpMethod } from '@/types';

const statusCodeColor = (code: number): string =>
  code < 300 ? 'success' : code < 400 ? 'processing' : code < 500 ? 'warning' : 'error';

export default function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [statusFilter, setSF] = useState('all');
  const [selected, setSelected] = useState<RequestLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await logsService.list({
        page,
        pageSize,
        search: search || undefined,
        method: method !== 'all' ? method : undefined,
        statusCode: statusFilter === '2xx' ? 200 : statusFilter === '4xx' ? 404 : statusFilter === '5xx' ? 500 : undefined,
      });
      setLogs(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to fetch request logs:', err);
      message.error('Failed to load request logs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, method, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async () => {
    try {
      const blob = await logsService.export({
        search: search || undefined,
        method: method !== 'all' ? method : undefined,
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'api_pulse_logs.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      message.success('Logs exported successfully');
    } catch {
      message.error('Export failed');
    }
  };

  const errorCount = logs.filter((l) => l.statusCode >= 400).length;
  const avgRT = logs.length
    ? Math.round(logs.reduce((s, l) => s + (l.responseTime || 0), 0) / logs.length)
    : 0;

  const columns: ColumnsType<RequestLog> = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'ts',
      width: 170,
      render: (v: string) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
          {formatDateTime(v)}
        </span>
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 90,
      render: (m: HttpMethod) => <HttpMethodTag method={m} size="sm" />,
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500 }}>{v}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'statusCode',
      key: 'status',
      width: 90,
      render: (code: number) => (
        <Tag
          color={statusCodeColor(code)}
          style={{ fontFamily: 'monospace', fontWeight: 700 }}
        >
          {code}
        </Tag>
      ),
      sorter: (a, b) => a.statusCode - b.statusCode,
    },
    {
      title: 'Latency',
      dataIndex: 'responseTime',
      key: 'rt',
      width: 100,
      render: (v: number) => (
        <span
          style={{
            color: v > 500 ? '#ef4444' : v > 200 ? '#f59e0b' : '#22c55e',
            fontWeight: 500,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {formatResponseTime(v)}
        </span>
      ),
      sorter: (a, b) => a.responseTime - b.responseTime,
    },
    {
      title: 'Size',
      dataIndex: 'responseSize',
      key: 'size',
      width: 90,
      render: (v: number) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatBytes(v || 0)}</span>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
          {v || '127.0.0.1'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Request Logs"
        subtitle="Real-time API request and response telemetry logs"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={logs.length === 0}>
              Export
            </Button>
          </Space>
        }
      />

      {/* Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <StatCard
            title="Total Requests Logged"
            value={total.toLocaleString()}
            color="#4f8ef7"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Error Rate"
            value={
              logs.length
                ? `${((errorCount / logs.length) * 100).toFixed(1)}%`
                : '0%'
            }
            color="#ef4444"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="Avg Response Time"
            value={`${avgRT}ms`}
            color="#f59e0b"
            loading={loading}
          />
        </Col>
      </Row>

      {/* Filters */}
      <Card
        style={{ marginBottom: 16, borderRadius: 12 }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Space size={12} wrap>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search path, IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220, borderRadius: 8 }}
            allowClear
          />
          <Select
            value={method}
            onChange={setMethod}
            style={{ width: 130 }}
            options={[
              { label: 'All Methods', value: 'all' },
              ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
                label: m,
                value: m,
              })),
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setSF}
            style={{ width: 140 }}
            options={[
              { label: 'All Status', value: 'all' },
              { label: '2xx Success', value: '2xx' },
              { label: '4xx Client', value: '4xx' },
              { label: '5xx Server', value: '5xx' },
            ]}
          />
        </Space>
      </Card>

      {logs.length === 0 && !loading ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: '40px 0' }}>
          <Empty
            description={
              <span>
                <strong>No Request Logs Recorded</strong>
                <br />
                <span style={{ color: '#64748b' }}>
                  Logs are recorded automatically whenever endpoints are checked via Ping (⚡) or monitored live.
                </span>
              </span>
            }
          />
        </Card>
      ) : (
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          onRow={(r) => ({
            onClick: () => setSelected(r),
            style: {
              cursor: 'pointer',
              background: r.statusCode >= 500 ? '#fff5f5' : undefined,
            },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (t) => `${t} total requests`,
          }}
          scroll={{ x: 900 }}
          style={{ background: '#fff', borderRadius: 12 }}
          size="small"
        />
      )}

      {/* Log detail drawer */}
      <Drawer
        title="Request Details"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={520}
      >
        {selected && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Timestamp">
              {formatDateTime(selected.timestamp)}
            </Descriptions.Item>
            <Descriptions.Item label="Method">
              <HttpMethodTag method={selected.method} />
            </Descriptions.Item>
            <Descriptions.Item label="Path">
              <code>{selected.path}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Status Code">
              <Tag color={statusCodeColor(selected.statusCode)}>
                {selected.statusCode}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Response Time">
              {formatResponseTime(selected.responseTime)}
            </Descriptions.Item>
            <Descriptions.Item label="Request Size">
              {formatBytes(selected.requestSize || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="Response Size">
              {formatBytes(selected.responseSize || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="IP Address">
              <code>{selected.ip || '127.0.0.1'}</code>
            </Descriptions.Item>
            <Descriptions.Item
              label="User Agent"
              style={{ wordBreak: 'break-all', fontSize: 12 }}
            >
              {selected.userAgent || 'API-Pulse-Client/1.0'}
            </Descriptions.Item>
            {selected.failureType && selected.failureType !== 'none' && (
              <Descriptions.Item label="Failure Type">
                <Tag color="error">{selected.failureType}</Tag>
              </Descriptions.Item>
            )}
            {selected.error && (
              <Descriptions.Item label="Error Message">
                <Tag color="error">{selected.error}</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
