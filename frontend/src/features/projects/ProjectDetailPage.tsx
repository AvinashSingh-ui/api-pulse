import React, { useState, useEffect } from 'react';
import {
  Tabs, Card, Button, Row, Col, Table, Tag, Space,
  Progress, Input, Select, Modal, Form, message, notification, Popconfirm,
  Tooltip, Badge, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, SearchOutlined,
  ThunderboltOutlined, ReloadOutlined, CopyOutlined,
  GlobalOutlined, DeleteOutlined, EyeOutlined, CheckOutlined,
  ApiOutlined, RiseOutlined, BellOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge, SeverityBadge } from '@/components/common/StatusBadge';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { EmptyState } from '@/components/common/EmptyState';
import { ResponseTimeChart } from '@/components/charts/ResponseTimeChart';
import { RequestVolumeChart } from '@/components/charts/RequestVolumeChart';
import { StatusDistributionChart } from '@/components/charts/StatusDistributionChart';
import { projectsService } from '@/services/endpoints/projects';
import { endpointsService } from '@/services/endpoints/endpoints';
import { alertsService } from '@/services/endpoints/alerts';
import { formatResponseTime, formatNumber, fromNow } from '@/utils';
import type { Project, Endpoint, Alert, MetricPoint, HttpMethod, AlertSeverity } from '@/types';

function generateTimeSeries(points = 24, base = 80, variance = 25): MetricPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    timestamp: new Date(Date.now() - (points - i) * 3600_000).toISOString(),
    value: base > 0 ? Math.max(10, Math.round(base + (Math.random() - 0.5) * variance * 2)) : 0,
  }));
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = id || '';

  const [project, setProject] = useState<Project | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm();

  const loadData = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [projData, epsData, alertsData] = await Promise.all([
        projectsService.get(projectId).catch(() => null),
        endpointsService.list({ projectId }).catch(() => ({ data: [] })),
        alertsService.listAlerts({ projectId }).catch(() => ({ data: [] })),
      ]);

      if (projData) {
        setProject(projData);
        settingsForm.setFieldsValue({
          name: projData.name,
          description: projData.description,
          baseUrl: projData.baseUrl,
          environment: projData.environment,
        });
      }
      setEndpoints(epsData.data || []);
      setAlerts(alertsData.data || []);
    } catch {
      message.error('Failed to load project details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleCopyBaseUrl = () => {
    if (project?.baseUrl) {
      navigator.clipboard.writeText(project.baseUrl);
      message.success('Base URL copied to clipboard!');
    }
  };

  const handleCreateEndpoint = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);
      const cleanPath = values.path.startsWith('/') ? values.path : `/${values.path}`;

      const created = await endpointsService.create({
        projectId,
        name: values.name,
        path: cleanPath,
        method: values.method,
        interval: values.interval || 60,
        expectedStatus: values.expectedStatus || 200,
        timeout: values.timeout || 5000,
        tags: values.tags || [],
      });

      setEndpoints(prev => [created, ...prev]);
      if (project) {
        setProject({ ...project, endpointCount: project.endpointCount + 1 });
      }
      setIsModalOpen(false);
      form.resetFields();
      message.success(`Endpoint "${created.method} ${created.path}" created successfully!`);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || 'Failed to create endpoint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHealthCheck = async (epId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckingId(epId);
    try {
      const res = await endpointsService.checkNow(epId);
      setEndpoints(prev => prev.map(item => {
        if (item.id === epId) {
          return {
            ...item,
            responseTimeP50: res.responseTime,
            responseTimeP95: Math.round(res.responseTime * 1.5),
            lastChecked: new Date().toISOString(),
            status: res.status as Endpoint['status'],
          };
        }
        return item;
      }));
      const isDegradedOrDown = res.status === 'down' || res.status === 'degraded' || (res.statusCode && res.statusCode >= 400);
      if (isDegradedOrDown) {
        notification.error({
          message: `🚨 Health Issue Detected: ${res.status.toUpperCase()}`,
          description: `Endpoint returned HTTP ${res.statusCode || 'Error'} in ${res.responseTime}ms. ${res.error || ''} Moving directly to Alert & AI Fix...`,
          duration: 3,
        });
        setTimeout(() => {
          navigate(`/alerts?endpointId=${epId}&aiFix=true${res.alert?.id ? `&alertId=${res.alert.id}` : ''}`);
        }, 600);
      } else {
        message.success(`Health check passed: HTTP ${res.statusCode || '200'} OK in ${res.responseTime}ms`);
      }
    } catch {
      message.error('Failed to trigger health check ping');
    } finally {
      setCheckingId(null);
    }
  };

  const handleDeleteEndpoint = async (epId: string, name: string) => {
    try {
      await endpointsService.delete(epId);
      setEndpoints(prev => prev.filter(e => e.id !== epId));
      if (project) {
        setProject({ ...project, endpointCount: Math.max(0, project.endpointCount - 1) });
      }
      message.success(`Endpoint "${name}" removed successfully.`);
    } catch {
      message.error('Failed to delete endpoint');
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await alertsService.resolveAlert(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved', resolvedAt: new Date().toISOString() } : a));
      message.success('Alert marked as resolved');
    } catch {
      message.error('Failed to resolve alert');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const values = await settingsForm.validateFields();
      const updated = await projectsService.update(projectId, values);
      setProject(updated);
      message.success('Project settings updated successfully!');
    } catch {
      message.error('Failed to update settings');
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#64748b' }}>Loading project details...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="Project Not Found"
        description="The requested project was not found or has been removed."
        action={<Button type="primary" onClick={() => navigate('/projects')}>Back to Projects</Button>}
      />
    );
  }

  const filteredEndpoints = endpoints.filter(e => {
    const matchSearch = e.path.toLowerCase().includes(search.toLowerCase()) || e.name.toLowerCase().includes(search.toLowerCase());
    const matchMethod = methodFilter === 'all' || e.method === methodFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchMethod && matchStatus;
  });

  const avgP50 = endpoints.length > 0
    ? Math.round(endpoints.reduce((acc, e) => acc + (e.responseTimeP50 || 0), 0) / endpoints.length)
    : 0;

  const rtData = generateTimeSeries(24, avgP50, 20);
  const rvData = generateTimeSeries(24, endpoints.length * 5, 2);

  const statusDistData = [
    { name: 'Healthy', value: endpoints.filter(e => e.status === 'healthy').length || (endpoints.length === 0 ? 1 : 0), color: '#22c55e' },
    { name: 'Degraded', value: endpoints.filter(e => e.status === 'degraded').length, color: '#f59e0b' },
    { name: 'Down', value: endpoints.filter(e => e.status === 'down').length, color: '#ef4444' },
  ];

  const endpointColumns: ColumnsType<Endpoint> = [
    {
      title: 'Endpoint',
      key: 'endpoint',
      width: 280,
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <HttpMethodTag method={r.method} size="sm" />
            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#1e293b', fontWeight: 600 }}>{r.path}</span>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.name}</span>
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
      title: 'P50 / P95',
      key: 'rt',
      width: 140,
      render: (_, r) => (
        <span style={{ fontSize: 12 }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{formatResponseTime(r.responseTimeP50)}</span>
          <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
          <span style={{ color: r.responseTimeP95 > 500 ? '#ef4444' : r.responseTimeP95 > 200 ? '#f59e0b' : '#4f8ef7', fontWeight: 600 }}>
            {formatResponseTime(r.responseTimeP95)}
          </span>
        </span>
      ),
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 130,
      render: (v: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={v} size="small" showInfo={false} strokeColor={v >= 99.5 ? '#22c55e' : '#f59e0b'} style={{ width: 60, margin: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>{v ? v.toFixed(1) : 100}%</span>
        </div>
      ),
    },
    {
      title: 'Last Check',
      dataIndex: 'lastChecked',
      key: 'lastChecked',
      width: 120,
      render: (v: string) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{fromNow(v)}</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_, r) => (
        <Space size={6} onClick={e => e.stopPropagation()}>
          <Tooltip title="Run live ping now">
            <Button
              size="small"
              icon={<ThunderboltOutlined style={{ color: '#4f8ef7' }} />}
              loading={checkingId === r.id}
              onClick={(e) => handleHealthCheck(r.id, e)}
            />
          </Tooltip>
          <Tooltip title="View endpoint details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/endpoints/${r.id}`)}
            />
          </Tooltip>
          <Tooltip title="Delete endpoint">
            <Popconfirm
              title="Delete endpoint?"
              description={`Delete ${r.method} ${r.path}?`}
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDeleteEndpoint(r.id, r.name)}
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={project.description || 'Configured API project under active monitoring'}
        breadcrumbs={[{ label: 'Projects', path: '/projects' }, { label: project.name }]}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
              Back to Projects
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
              style={{ borderRadius: 8 }}
            >
              Add Endpoint
            </Button>
          </Space>
        }
      />

      {/* Project Meta Banner */}
      <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Tag color={project.environment === 'production' ? 'red' : 'orange'} style={{ fontWeight: 700, fontSize: 11 }}>
              {project.environment.toUpperCase()}
            </Tag>
            <Badge status="processing" text={<span style={{ fontWeight: 600, color: '#0f172a' }}>Active Monitoring</span>} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <GlobalOutlined style={{ color: '#64748b', fontSize: 13 }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#334155' }}>{project.baseUrl}</span>
              <Tooltip title="Copy Base URL">
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyBaseUrl} style={{ padding: '0 4px', height: 20 }} />
              </Tooltip>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Updated: {fromNow(project.updatedAt)}</span>
          </div>
        </div>
      </Card>

      {/* Summary Stat Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Total Endpoints"
            value={endpoints.length}
            icon={<ApiOutlined />}
            color="#4f8ef7"
            subtitle={`${endpoints.filter(e => e.status === 'healthy').length} healthy`}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Health Score"
            value={`${project.healthScore}%`}
            icon={<RiseOutlined />}
            color="#22c55e"
            subtitle="Based on uptime & error limits"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Avg Response Time"
            value={avgP50 > 0 ? `${avgP50}ms` : '0ms'}
            icon={<ThunderboltOutlined />}
            color="#f59e0b"
            subtitle="Median latency across routes"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Active Alerts"
            value={alerts.filter(a => a.status === 'active').length}
            icon={<BellOutlined />}
            color={alerts.filter(a => a.status === 'active').length > 0 ? '#ef4444' : '#22c55e'}
            subtitle={alerts.filter(a => a.status === 'active').length > 0 ? 'Action required' : 'All systems normal'}
          />
        </Col>
      </Row>

      {/* Detailed Tabs */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 20px 24px' } }}>
        <Tabs
          defaultActiveKey="endpoints"
          items={[
            {
              key: 'endpoints',
              label: (
                <span>
                  <ApiOutlined /> Endpoints <Badge count={endpoints.length} style={{ backgroundColor: '#4f8ef7', marginLeft: 4 }} />
                </span>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '12px 0 16px' }}>
                    <Space size={10} wrap>
                      <Input
                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                        placeholder="Search routes or names..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: 220, borderRadius: 8 }}
                        allowClear
                      />
                      <Select
                        value={methodFilter}
                        onChange={setMethodFilter}
                        style={{ width: 120 }}
                        options={[
                          { label: 'All Methods', value: 'all' },
                          ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map(m => ({ label: m, value: m })),
                        ]}
                      />
                      <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        style={{ width: 130 }}
                        options={[
                          { label: 'All Statuses', value: 'all' },
                          { label: 'Healthy', value: 'healthy' },
                          { label: 'Degraded', value: 'degraded' },
                          { label: 'Down', value: 'down' },
                        ]}
                      />
                      <Button icon={<ReloadOutlined />} onClick={loadData} />
                    </Space>

                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setIsModalOpen(true)}
                      style={{ borderRadius: 8 }}
                    >
                      Add Endpoint
                    </Button>
                  </div>

                  {endpoints.length === 0 ? (
                    <EmptyState
                      title="No Endpoints Registered"
                      description="Add your first API endpoint to start live health monitoring."
                      action={
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                          Add First Endpoint
                        </Button>
                      }
                    />
                  ) : (
                    <Table
                      dataSource={filteredEndpoints}
                      columns={endpointColumns}
                      rowKey="id"
                      pagination={{ pageSize: 10, showTotal: (t) => `${t} endpoints` }}
                      scroll={{ x: 900 }}
                      onRow={record => ({
                        onClick: () => navigate(`/endpoints/${record.id}`),
                        style: { cursor: 'pointer' },
                      })}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'monitoring',
              label: (
                <span>
                  <RiseOutlined /> Monitoring & Performance
                </span>
              ),
              children: (
                <div style={{ marginTop: 12 }}>
                  <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col xs={24} lg={16}>
                      <ResponseTimeChart data={rtData} height={280} />
                    </Col>
                    <Col xs={24} lg={8}>
                      <StatusDistributionChart data={statusDistData} height={280} title="Endpoint Health" />
                    </Col>
                  </Row>
                  <RequestVolumeChart data={rvData} height={240} />
                </div>
              ),
            },
            {
              key: 'alerts',
              label: (
                <span>
                  <BellOutlined /> Alerts <Badge count={alerts.filter(a => a.status === 'active').length} style={{ backgroundColor: '#ef4444', marginLeft: 4 }} />
                </span>
              ),
              children: (
                <div style={{ marginTop: 16 }}>
                  {alerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      <CheckOutlined style={{ fontSize: 32, color: '#22c55e', marginBottom: 12 }} />
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>No incidents recorded</p>
                      <p>All endpoints in {project.name} are operating normally.</p>
                    </div>
                  ) : (
                    <Table
                      dataSource={alerts}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      columns={[
                        {
                          title: 'Severity',
                          dataIndex: 'severity',
                          key: 'severity',
                          width: 100,
                          render: (s: AlertSeverity) => <SeverityBadge severity={s} />,
                        },
                        {
                          title: 'Alert Title & Description',
                          key: 'title',
                          render: (_, r) => (
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.title}</div>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.message}</div>
                            </div>
                          ),
                        },
                        {
                          title: 'Triggered',
                          dataIndex: 'triggeredAt',
                          key: 'triggeredAt',
                          width: 140,
                          render: (t: string) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{fromNow(t)}</span>,
                        },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          key: 'status',
                          width: 120,
                          render: (status: Alert['status']) => (
                            <Tag color={status === 'active' ? 'error' : status === 'acknowledged' ? 'warning' : 'success'}>
                              {status.toUpperCase()}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Actions',
                          key: 'actions',
                          width: 130,
                          render: (_, r) => r.status === 'active' ? (
                            <Button
                              size="small"
                              type="primary"
                              icon={<CheckOutlined />}
                              onClick={() => handleResolveAlert(r.id)}
                            >
                              Resolve
                            </Button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>Resolved</span>
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'settings',
              label: (
                <span>
                  <SettingOutlined /> Settings
                </span>
              ),
              children: (
                <div style={{ maxWidth: 640, marginTop: 16 }}>
                  <Form
                    form={settingsForm}
                    layout="vertical"
                    onFinish={handleSaveSettings}
                  >
                    <Form.Item name="name" label="Project Name" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, type: 'url' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="environment" label="Environment" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: 'Production', value: 'production' },
                          { label: 'Staging', value: 'staging' },
                          { label: 'Development', value: 'development' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit">
                        Save Project Settings
                      </Button>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Add Endpoint Modal */}
      <Modal
        title={`Add Endpoint to ${project.name}`}
        open={isModalOpen}
        onOk={handleCreateEndpoint}
        onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
        confirmLoading={isSubmitting}
        okText="Register Endpoint"
        cancelText="Cancel"
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{ method: 'GET', expectedStatus: 200, interval: 60, timeout: 5000, tags: [] }}
        >
          <Form.Item
            name="name"
            label="Endpoint Name"
            rules={[{ required: true, message: 'Please provide endpoint name' }]}
          >
            <Input placeholder="e.g. Fetch Order Summary" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item
              name="method"
              label="Method"
              style={{ width: 130 }}
              rules={[{ required: true }]}
            >
              <Select
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ label: m, value: m }))}
              />
            </Form.Item>
            <Form.Item
              name="path"
              label="Route Path"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'Please provide route path' }]}
            >
              <Input placeholder="/api/v1/orders/:id" />
            </Form.Item>
          </Space>

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="e.g. orders, checkout" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
