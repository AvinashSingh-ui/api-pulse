import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Input, Select, Button, Tag, Progress,
  Space, Popconfirm, Tooltip, Badge, Modal, Form, message, Spin, Tabs, Table, Typography,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, GlobalOutlined,
  ApiOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined,
  HistoryOutlined, UndoOutlined, CopyOutlined, AppstoreOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState }  from '@/components/common/EmptyState';
import { projectsService } from '@/services/endpoints/projects';
import { fromNow, formatDate } from '@/utils';
import type { Project } from '@/types';

const { Text } = Typography;

const ENV_COLORS: Record<string, string> = { production: 'red', staging: 'orange', development: 'blue' };
const STATUS_COLORS: Record<string, string> = { active: 'processing', inactive: 'default', archived: 'warning', deleted: 'error' };
const HEALTH_COLOR = (s: number) => s >= 95 ? '#22c55e' : s >= 80 ? '#f59e0b' : '#ef4444';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Tab state: support URL query param ?tab=history or active
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab') === 'history' ? 'history' : 'active';
  const [activeTab, setActiveTab] = useState<'active' | 'history'>(initialTab);

  // Active Projects state
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [activeSearch, setActiveSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [activeEnv, setActiveEnv] = useState<string>('all');

  // History Projects state
  const [historyProjects, setHistoryProjects] = useState<Project[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<string>('all');
  const [historyEnv, setHistoryEnv] = useState<string>('all');

  // Modal State for New Project
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Load Active Projects
  const loadActiveProjects = useCallback(async () => {
    setIsLoadingActive(true);
    try {
      const res = await projectsService.list({
        tab: 'active',
        search: activeSearch || undefined,
        status: activeStatus !== 'all' ? activeStatus : undefined,
        environment: activeEnv !== 'all' ? activeEnv : undefined,
      });
      setActiveProjects(res.data || []);
    } catch {
      message.error('Failed to load active projects from server');
    } finally {
      setIsLoadingActive(false);
    }
  }, [activeSearch, activeStatus, activeEnv]);

  // Load History Projects
  const loadHistoryProjects = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await projectsService.list({
        tab: 'history',
        search: historySearch || undefined,
        status: historyStatus !== 'all' ? historyStatus : undefined,
        environment: historyEnv !== 'all' ? historyEnv : undefined,
      });
      setHistoryProjects(res.data || []);
    } catch {
      message.error('Failed to load project history from server');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historySearch, historyStatus, historyEnv]);

  // Initial & reactive data loading
  useEffect(() => {
    loadActiveProjects();
  }, [loadActiveProjects]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistoryProjects();
    }
  }, [activeTab, loadHistoryProjects]);

  // Sync tab with URL
  const handleTabChange = (key: string) => {
    const newTab = key as 'active' | 'history';
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    if (newTab === 'history') {
      params.set('tab', 'history');
    } else {
      params.delete('tab');
    }
    navigate({ search: params.toString() }, { replace: true });
  };

  // Create Project
  const handleCreateProject = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);
      const created = await projectsService.create({
        name: values.name,
        description: values.description || '',
        baseUrl: values.baseUrl,
        environment: values.environment || 'production',
        status: 'active',
        tags: values.tags || [],
      });

      setActiveProjects(prev => [created, ...prev]);
      setIsModalOpen(false);
      form.resetFields();
      message.success(`Project "${created.name}" created successfully!`);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Soft Delete: Move to Project History
  const handleSoftDelete = async (id: string, name: string) => {
    try {
      await projectsService.delete(id);
      setActiveProjects(prev => prev.filter(p => p.id !== id));
      message.success(`Project "${name}" moved to Project History. Monitoring has been paused.`);
      // Refresh history list in background
      loadHistoryProjects();
    } catch (err: any) {
      message.error(err.message || 'Failed to delete project');
    }
  };

  // Restore Project from History
  const handleRestore = async (id: string, name: string) => {
    try {
      const res = await projectsService.restore(id);
      setHistoryProjects(prev => prev.filter(p => p.id !== id));
      message.success(`Project "${name}" restored to Active Projects successfully!`);
      // Refresh active list
      loadActiveProjects();
      setActiveTab('active');
    } catch (err: any) {
      message.error(err.message || 'Failed to restore project');
    }
  };

  // Permanent Deletion from History
  const handlePermanentDelete = async (id: string, name: string) => {
    try {
      await projectsService.permanentDelete(id);
      setHistoryProjects(prev => prev.filter(p => p.id !== id));
      message.success(`Project "${name}" and all historical data permanently removed.`);
    } catch (err: any) {
      message.error(err.message || 'Failed to permanently delete project');
    }
  };

  // Columns for Project History Table
  const historyColumns: ColumnsType<Project> = [
    {
      title: 'Project Name',
      key: 'name',
      width: 240,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{r.name}</div>
          {r.description && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'API Server URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      width: 220,
      render: (url: string) => (
        <Space size={4}>
          <Text code style={{ fontSize: 12 }}>{url}</Text>
          <Tooltip title="Copy URL">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 11, color: '#94a3b8' }} />}
              onClick={() => {
                navigator.clipboard.writeText(url);
                message.success('URL copied to clipboard');
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Environment',
      dataIndex: 'environment',
      key: 'env',
      width: 120,
      render: (env: string) => (
        <Tag color={ENV_COLORS[env] || 'default'} style={{ fontSize: 11, fontWeight: 600 }}>
          {env?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => (
        <Tag color={status === 'deleted' ? 'error' : status === 'archived' ? 'warning' : 'default'} style={{ fontWeight: 600 }}>
          {status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Endpoints',
      dataIndex: 'endpointCount',
      key: 'endpointCount',
      width: 100,
      render: (count: number) => (
        <Space size={6}>
          <ApiOutlined style={{ color: '#64748b' }} />
          <span style={{ fontWeight: 600 }}>{count ?? 0}</span>
        </Space>
      ),
    },
    {
      title: 'Registered On',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (d: string) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{d ? formatDate(d) : 'N/A'}</span>
      ),
    },
    {
      title: 'Deleted / Archived',
      key: 'deletedAt',
      width: 140,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>
          {r.deletedAt ? fromNow(r.deletedAt) : r.updatedAt ? fromNow(r.updatedAt) : 'Recently'}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space size={8}>
          <Popconfirm
            title="Restore Project?"
            description={`Restore "${r.name}" back to Active Projects? Monitoring will resume upon restoration.`}
            okText="Restore"
            cancelText="Cancel"
            onConfirm={() => handleRestore(r.id, r.name)}
          >
            <Button size="small" type="primary" icon={<UndoOutlined />} style={{ borderRadius: 6, fontSize: 12 }}>
              Restore
            </Button>
          </Popconfirm>

          <Popconfirm
            title="Permanently Delete Project?"
            description="Warning: This action CANNOT be undone. All endpoints, logs, alerts, and historical telemetry will be permanently wiped."
            okText="Delete Permanently"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => handlePermanentDelete(r.id, r.name)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6, fontSize: 12 }}>
              Delete Permanently
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Manage microservice projects, live telemetry routes, and historical project lifecycles"
        breadcrumbs={[{ label: 'Projects' }]}
        actions={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                if (activeTab === 'active') loadActiveProjects();
                else loadHistoryProjects();
              }}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
              style={{ borderRadius: 8 }}
            >
              New Project
            </Button>
          </Space>
        }
      />

      {/* Main Tab Controller: Active Projects vs Project History */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        style={{ marginBottom: 20 }}
        items={[
          {
            key: 'active',
            label: (
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                <AppstoreOutlined style={{ marginRight: 6 }} />
                Active Projects{' '}
                <Badge
                  count={activeProjects.length}
                  style={{ backgroundColor: '#4f8ef7', marginLeft: 4 }}
                />
              </span>
            ),
          },
          {
            key: 'history',
            label: (
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                <HistoryOutlined style={{ marginRight: 6 }} />
                Project History{' '}
                {historyProjects.length > 0 && (
                  <Badge
                    count={historyProjects.length}
                    style={{ backgroundColor: '#94a3b8', marginLeft: 4 }}
                  />
                )}
              </span>
            ),
          },
        ]}
      />

      {/* ── TAB 1: ACTIVE PROJECTS ────────────────────────────────────────── */}
      {activeTab === 'active' && (
        <div>
          {/* Active Filter Toolbar */}
          <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            <Space wrap size={12}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Search active projects by name or base URL..."
                value={activeSearch}
                onChange={e => setActiveSearch(e.target.value)}
                style={{ width: 280, borderRadius: 8 }}
                allowClear
              />
              <Select
                value={activeEnv}
                onChange={setActiveEnv}
                style={{ width: 160 }}
                options={[
                  { label: 'All Environments', value: 'all' },
                  { label: 'Production',       value: 'production' },
                  { label: 'Staging',          value: 'staging' },
                  { label: 'Development',      value: 'development' },
                ]}
              />
              <Select
                value={activeStatus}
                onChange={setActiveStatus}
                style={{ width: 140 }}
                options={[
                  { label: 'All Statuses', value: 'all' },
                  { label: 'Active',       value: 'active' },
                  { label: 'Inactive',     value: 'inactive' },
                ]}
              />
            </Space>
          </Card>

          {/* Active Projects Loading / Empty / Grid */}
          {isLoadingActive ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: '#64748b' }}>Loading active projects...</div>
            </div>
          ) : activeProjects.length === 0 ? (
            <EmptyState
              title="No Active Projects"
              description="No active projects yet. Create your first project to start monitoring API performance."
              action={
                <Space>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                    Create Your First Project
                  </Button>
                  {historyProjects.length > 0 && (
                    <Button onClick={() => setActiveTab('history')}>
                      View Project History ({historyProjects.length})
                    </Button>
                  )}
                </Space>
              }
            />
          ) : (
            <Row gutter={[16, 16]}>
              {activeProjects.map(project => (
                <Col xs={24} sm={12} lg={8} key={project.id}>
                  <Card
                    hoverable
                    style={{
                      height: '100%',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.2s ease',
                      border: '1px solid #e2e8f0',
                    }}
                    styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{project.name}</span>
                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Tag color={ENV_COLORS[project.environment]} style={{ fontSize: 11, fontWeight: 600 }}>
                            {project.environment.toUpperCase()}
                          </Tag>
                          <Badge status={STATUS_COLORS[project.status] as any} text={<span style={{ fontSize: 12 }}>{project.status}</span>} />
                        </div>
                      </div>

                      <Space onClick={e => e.stopPropagation()}>
                        <Tooltip title="View Project Details">
                          <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${project.id}`)} />
                        </Tooltip>
                        <Popconfirm
                          title="Move to Project History?"
                          description="This will soft-delete the project and pause continuous health checks. You can restore it anytime."
                          okText="Delete Project"
                          okButtonProps={{ danger: true }}
                          cancelText="Cancel"
                          onConfirm={() => handleSoftDelete(project.id, project.name)}
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    </div>

                    {/* Description */}
                    <p style={{
                      color: '#64748b',
                      fontSize: 13,
                      flex: 1,
                      margin: '6px 0 14px',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {project.description || 'No description provided.'}
                    </p>

                    {/* Base URL */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: '#64748b',
                      marginBottom: 14,
                      background: '#f8fafc',
                      padding: '6px 10px',
                      borderRadius: 6,
                    }}>
                      <GlobalOutlined style={{ color: '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.baseUrl}
                      </span>
                    </div>

                    {/* Metrics Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ApiOutlined style={{ color: '#4f8ef7' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {project.endpointCount} {project.endpointCount === 1 ? 'endpoint' : 'endpoints'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Health Score: </span>
                        <span style={{ fontWeight: 700, color: HEALTH_COLOR(project.healthScore || 100), fontSize: 13 }}>
                          {project.healthScore || 100}%
                        </span>
                      </div>
                    </div>

                    <Progress
                      percent={project.healthScore || 100}
                      size="small"
                      showInfo={false}
                      strokeColor={HEALTH_COLOR(project.healthScore || 100)}
                      style={{ marginBottom: 10 }}
                    />

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94a3b8' }}>
                      <span>Created {fromNow(project.createdAt)}</span>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontSize: 12, color: '#4f8ef7' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projects/${project.id}`);
                        }}
                      >
                        View Endpoints →
                      </Button>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </div>
      )}

      {/* ── TAB 2: PROJECT HISTORY (DELETED & ARCHIVED) ───────────────────── */}
      {activeTab === 'history' && (
        <div>
          {/* History Filter Toolbar */}
          <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            <Space wrap size={12}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Search history by project name or base URL..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{ width: 300, borderRadius: 8 }}
                allowClear
              />
              <Select
                value={historyEnv}
                onChange={setHistoryEnv}
                style={{ width: 160 }}
                options={[
                  { label: 'All Environments', value: 'all' },
                  { label: 'Production',       value: 'production' },
                  { label: 'Staging',          value: 'staging' },
                  { label: 'Development',      value: 'development' },
                ]}
              />
              <Select
                value={historyStatus}
                onChange={setHistoryStatus}
                style={{ width: 140 }}
                options={[
                  { label: 'All Statuses', value: 'all' },
                  { label: 'Deleted',      value: 'deleted' },
                  { label: 'Archived',     value: 'archived' },
                ]}
              />
              <Button icon={<ReloadOutlined />} onClick={loadHistoryProjects} loading={isLoadingHistory}>
                Refresh History
              </Button>
            </Space>
          </Card>

          {/* History Table */}
          {isLoadingHistory ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: '#64748b' }}>Loading project history...</div>
            </div>
          ) : historyProjects.length === 0 ? (
            <EmptyState
              title="No Project History"
              description="No deleted or archived projects found. When you delete a project, it will be safely retained here where you can restore it anytime."
              action={
                <Button type="primary" onClick={() => setActiveTab('active')}>
                  Back to Active Projects
                </Button>
              }
            />
          ) : (
            <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
              <Table
                dataSource={historyProjects}
                columns={historyColumns}
                rowKey="id"
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 10, showTotal: (t) => `${t} total historical projects` }}
              />
            </Card>
          )}
        </div>
      )}

      {/* ── Modal: Create New Project ─────────────────────────────────────── */}
      <Modal
        title="Create New Project"
        open={isModalOpen}
        onOk={handleCreateProject}
        onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
        confirmLoading={isSubmitting}
        okText="Create Project"
        cancelText="Cancel"
        destroyOnClose
        width={560}
        style={{ maxWidth: '95vw' }}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{ environment: 'production', tags: [] }}
        >
          <Form.Item
            name="name"
            label="Project Name"
            rules={[{ required: true, message: 'Please provide a project name' }]}
          >
            <Input placeholder="e.g. Orders Microservice" />
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="Base Server URL"
            rules={[
              { required: true, message: 'Please provide a base URL' },
              { type: 'url', message: 'Must be a valid URL starting with http:// or https://' },
            ]}
          >
            <Input placeholder="https://api.orders.example.com" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Brief summary of the services and routes in this project" />
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

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="e.g. backend, core, v1" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
