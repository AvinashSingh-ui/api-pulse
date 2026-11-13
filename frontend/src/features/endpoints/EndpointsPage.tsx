import React, { useState, useEffect } from 'react';
import {
  Table, Input, Select, Button, Space, Tag, Tooltip,
  Progress, Card, Modal, Form, message, notification, Popconfirm, Spin,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  ThunderboltOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader }    from '@/components/common/PageHeader';
import { StatusBadge }   from '@/components/common/StatusBadge';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { EmptyState }    from '@/components/common/EmptyState';
import { endpointsService } from '@/services/endpoints/endpoints';
import { projectsService }  from '@/services/endpoints/projects';
import { formatResponseTime, fromNow } from '@/utils';
import type { Endpoint, HttpMethod, Project } from '@/types';

/**
 * EndpointsPage:
 * - Displays all registered API routes with real-time status badges, P50/P95 latency, and 24h uptime.
 * - Beginner-Friendly Architecture:
 *   1. Modal & Form Reset: Initializes form values on open (`handleOpenCreateModal`) so `projectId` is never blank.
 *   2. Stop Event Propagation: Action buttons inside table cells use `e.stopPropagation()` so clicking a button doesn't trigger the row navigation.
 *   3. Popconfirm Safety: Uses Ant Design's built-in `<Popconfirm>` dialog before executing destructive DELETE actions.
 *   4. Direct Route to AI Fix: If a live ping fails, the user is immediately taken to the Alert & AI Fix drawer.
 */
export default function EndpointsPage() {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [project, setProject] = useState<string>('all');
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // New Endpoint Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form] = Form.useForm();

  const handleOpenCreateModal = () => {
    if (projects.length === 0) {
      message.warning('Please create a project first before registering endpoints.');
      navigate('/projects');
      return;
    }
    form.setFieldsValue({
      projectId: projects[0]?.id,
      method: 'GET',
      interval: 60,
      expectedStatus: 200,
      timeout: 5000,
    });
    setIsModalOpen(true);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [epsRes, projsRes] = await Promise.all([
        endpointsService.list({
          search: search || undefined,
          method: method !== 'all' ? method : undefined,
          projectId: project !== 'all' ? project : undefined,
        }),
        projectsService.list(),
      ]);
      setEndpoints(epsRes.data || []);
      setProjects(projsRes.data || []);
    } catch {
      message.error('Failed to load endpoints');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, method, project]);

  const handleRegisterEndpoint = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);
      const cleanPath = values.path.startsWith('/') ? values.path : `/${values.path}`;

      const created = await endpointsService.create({
        projectId: values.projectId,
        name: values.name,
        path: cleanPath,
        method: values.method,
        interval: values.interval || 60,
        expectedStatus: values.expectedStatus || 200,
        timeout: values.timeout || 5000,
        tags: values.tags || [],
      });

      setEndpoints(prev => [created, ...prev]);
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

  const handlePing = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckingId(id);
    try {
      const res = await endpointsService.checkNow(id);
      setEndpoints(prev => prev.map(ep => {
        if (ep.id === id) {
          return {
            ...ep,
            responseTimeP50: res.responseTime,
            responseTimeP95: Math.round(res.responseTime * 1.5),
            lastChecked: new Date().toISOString(),
            status: res.status as Endpoint['status'],
          };
        }
        return ep;
      }));
      const isDegradedOrDown = res.status === 'down' || res.status === 'degraded' || (res.statusCode && res.statusCode >= 400);
      if (isDegradedOrDown) {
        notification.error({
          message: `🚨 Health Issue Detected: ${res.status.toUpperCase()}`,
          description: `Endpoint returned HTTP ${res.statusCode || 'Error'} in ${res.responseTime}ms.${res.error || ''} Moving directly to Alert & AI Fix...`,
          duration: 3,
        });
        setTimeout(() => {
          navigate(`/alerts?endpointId=${id}&aiFix=true${res.alert?.id ? `&alertId=${res.alert.id}` : ''}`);
        }, 600);
      } else {
        message.success(`Health check passed: HTTP ${res.statusCode || '200'} OK in ${res.responseTime}ms`);
      }
    } catch {
      message.error('Ping check failed');
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await endpointsService.delete(id);
      setEndpoints(prev => prev.filter(e => e.id !== id));
      message.success(`Endpoint "${name}" removed successfully.`);
    } catch {
      message.error('Failed to delete endpoint');
    }
  };

  const filtered = endpoints.filter(e => {
    const matchStatus = status === 'all' || e.status === status;
    return matchStatus;
  });

  const columns: ColumnsType<Endpoint> = [
    {
      title: 'Endpoint',
      key: 'endpoint',
      width: 280,
      render: (_, r) => {
        const proj = projects.find(p => p.id === r.projectId);
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <HttpMethodTag method={r.method} size="sm" />
              <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#1e293b', fontWeight: 600 }}>
                {r.path}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {r.name} {proj ? `• ${proj.name}` : ''}
            </div>
          </div>
        );
      },
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
      title: 'Uptime (24h)',
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
              onClick={(e) => handlePing(r.id, e)}
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
              onConfirm={() => handleDelete(r.id, r.name)}
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
        title="Endpoints"
        subtitle="Real-time monitoring across all registered API routes"
        breadcrumbs={[{ label: 'Endpoints' }]}
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              style={{ borderRadius: 8 }}
            >
              Add Endpoint
            </Button>
          </Space>
        }
      />

      {/* Filter toolbar */}
      <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap size={12}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search path or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220, borderRadius: 8 }}
            allowClear
          />
          <Select
            value={method}
            onChange={setMethod}
            style={{ width: 120 }}
            options={[
              { label: 'All Methods', value: 'all' },
              ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map(m => ({ label: m, value: m })),
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 130 }}
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Healthy', value: 'healthy' },
              { label: 'Degraded', value: 'degraded' },
              { label: 'Down', value: 'down' },
            ]}
          />
          <Select
            value={project}
            onChange={setProject}
            style={{ width: 180 }}
            options={[
              { label: 'All Projects', value: 'all' },
              ...projects.map(p => ({ label: p.name, value: p.id })),
            ]}
          />
        </Space>
      </Card>

      {/* Table view */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#64748b' }}>Loading endpoints...</div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Endpoints Found"
          description={search ? 'No endpoints match your filters.' : 'There are no endpoints monitored yet. Click below to register your first route.'}
          action={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
            >
              {projects.length === 0 ? 'Create a Project First' : 'Add First Endpoint'}
            </Button>
          }
        />
      ) : (
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 15, showTotal: (t) => `${t} total endpoints` }}
            scroll={{ x: 900 }}
            onRow={record => ({
              onClick: () => navigate(`/endpoints/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      )}

      {/* Register Endpoint Modal */}
      <Modal
        title="Register New Endpoint"
        open={isModalOpen}
        onOk={handleRegisterEndpoint}
        onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
        confirmLoading={isSubmitting}
        okText="Register Endpoint"
        cancelText="Cancel"
        destroyOnClose
        width={560}
        style={{ maxWidth: '95vw' }}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            method: 'GET',
            interval: 60,
            expectedStatus: 200,
            timeout: 5000,
            projectId: projects[0]?.id,
          }}
        >
          <Form.Item
            name="projectId"
            label="Target Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select options={projects.map(p => ({ label: p.name, value: p.id }))} />
          </Form.Item>

          <Form.Item
            name="name"
            label="Endpoint Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="e.g. Get User Profile" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item name="method" label="Method" style={{ width: 130 }} rules={[{ required: true }]}>
              <Select options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ label: m, value: m }))} />
            </Form.Item>
            <Form.Item name="path" label="Route Path" style={{ flex: 1 }} rules={[{ required: true, message: 'Route path required' }]}>
              <Input placeholder="/api/v1/users/:id" />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item name="interval" label="Interval (sec)" style={{ flex: 1 }}>
              <Select options={[15, 30, 60, 300].map(s => ({ label: `${s} seconds`, value: s }))} />
            </Form.Item>
            <Form.Item name="expectedStatus" label="Expected HTTP Status" style={{ flex: 1 }}>
              <Select options={[200, 201, 204, 401, 404].map(c => ({ label: `HTTP ${c}`, value: c }))} />
            </Form.Item>
          </Space>

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="e.g. auth, users, critical" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
