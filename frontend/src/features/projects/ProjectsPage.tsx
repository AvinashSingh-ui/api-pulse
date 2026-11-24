import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Input, Select, Button, Tag, Progress,
  Space, Popconfirm, Tooltip, Badge, Modal, Form, message, Spin, Tabs, Table, Typography, Alert,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, GlobalOutlined,
  ApiOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined,
  HistoryOutlined, UndoOutlined, CopyOutlined, AppstoreOutlined,
  ExclamationCircleOutlined, ImportOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState }  from '@/components/common/EmptyState';
import { ApiImportModal } from '@/components/common/ApiImportModal';
import { projectsService } from '@/services/endpoints/projects';
import { fromNow, formatDate } from '@/utils';
import { useAppSelector } from '@/app/hooks';
import { useTheme } from '@/hooks/useTheme';
import type { Project } from '@/types';

const { Text } = Typography;

const ENV_COLORS: Record<string, string> = {
  production: 'error',
  staging: 'warning',
  development: 'processing',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'processing',
  inactive: 'default',
  archived: 'warning',
  deleted: 'error',
};

const HEALTH_COLOR = (s: number) => (s >= 95 ? '#10b981' : s >= 80 ? '#f59e0b' : '#f43f5e');

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

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

  // Modal State for New Project & Import Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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
        bearerToken: values.bearerToken?.trim() || undefined,
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
      loadHistoryProjects();
    } catch (err: any) {
      message.error(err.message || 'Failed to delete project');
    }
  };

  // Restore Project from History
  const handleRestore = async (id: string, name: string) => {
    try {
      await projectsService.restore(id);
      setHistoryProjects(prev => prev.filter(p => p.id !== id));
      message.success(`Project "${name}" restored to Active Projects successfully!`);
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
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{r.name}</div>
          {r.description && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Deployed Link / Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      width: 240,
      render: (url: string) => (
        <Space size={6}>
          <Text code style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{url}</Text>
          <Tooltip title="Copy Deployed Link / Base URL">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 11, color: '#94a3b8' }} />}
              onClick={() => {
                navigator.clipboard.writeText(url);
                message.success('Deployed link / Base URL copied to clipboard');
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
        <Tag color={ENV_COLORS[env] || 'default'} style={{ fontSize: 11, fontWeight: 700 }}>
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
        <Tag color={status === 'deleted' ? 'error' : status === 'archived' ? 'warning' : 'default'} style={{ fontWeight: 700 }}>
          {status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Endpoints',
      dataIndex: 'endpointCount',
      key: 'endpointCount',
      width: 110,
      render: (count: number) => (
        <Space size={6}>
          <ApiOutlined style={{ color: 'var(--color-text-secondary)' }} />
          <span style={{ fontWeight: 700 }}>{count ?? 0}</span>
        </Space>
      ),
    },
    {
      title: 'Registered On',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (d: string) => (
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{d ? formatDate(d) : 'N/A'}</span>
      ),
    },
    {
      title: 'Deleted / Archived',
      key: 'deletedAt',
      width: 140,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#f43f5e', fontWeight: 600 }}>
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
            <Button size="small" type="primary" className="btn-primary-gradient" icon={<UndoOutlined />} style={{ fontSize: 12, height: 28, borderRadius: 6 }}>
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
            <Button size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12, height: 28, borderRadius: 6 }}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Projects & Microservices"
        subtitle="Manage microservice projects, live telemetry routes, and historical project lifecycles"
        breadcrumbs={[{ label: 'Projects' }]}
        actions={
          <Space size={10}>
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
              icon={<ImportOutlined />}
              onClick={() => setIsImportModalOpen(true)}
            >
              Import APIs
            </Button>
            <Button
              type="primary"
              className="btn-primary-gradient"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
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
              <span style={{ fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AppstoreOutlined />
                Active Projects
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 22,
                    height: 20,
                    padding: '0 6px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: isDark ? '#27272a' : '#e4e4e7',
                    color: isDark ? '#f4f4f5' : '#18181b',
                    border: `1px solid ${isDark ? '#3f3f46' : '#d4d4d8'}`,
                    lineHeight: 1,
                  }}
                >
                  {activeProjects.length}
                </span>
              </span>
            ),
          },
          {
            key: 'history',
            label: (
              <span style={{ fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HistoryOutlined />
                Project History
                {historyProjects.length > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 22,
                      height: 20,
                      padding: '0 6px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: isDark ? '#27272a' : '#e4e4e7',
                      color: isDark ? '#a1a1aa' : '#52525b',
                      border: `1px solid ${isDark ? '#3f3f46' : '#d4d4d8'}`,
                      lineHeight: 1,
                    }}
                  >
                    {historyProjects.length}
                  </span>
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
          <Card className="card-modern" style={{ marginBottom: 20 }} styles={{ body: { padding: '14px 20px' } }}>
            <Space wrap size={12}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Search active projects by name or deployed link..."
                value={activeSearch}
                onChange={e => setActiveSearch(e.target.value)}
                style={{ width: 320 }}
                allowClear
              />
              <Select
                value={activeEnv}
                onChange={setActiveEnv}
                style={{ width: 170 }}
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
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Loading active projects...</div>
            </div>
          ) : activeProjects.length === 0 ? (
            <EmptyState
              title="No Active Projects"
              description="No active projects yet. Create your first project to start monitoring API performance."
              action={
                <Space size={10}>
                  <Button type="primary" className="btn-primary-gradient" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                    Create First Project
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
            <Row gutter={[20, 20]}>
              {activeProjects.map(project => (
                <Col xs={24} sm={12} lg={8} key={project.id}>
                  <Card
                    hoverable
                    className="card-modern card-modern-hover"
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                    }}
                    styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '22px 24px' } }}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                          {project.name}
                        </span>
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Tag color={ENV_COLORS[project.environment]} style={{ fontSize: 11, fontWeight: 700, borderRadius: 6 }}>
                            {project.environment.toUpperCase()}
                          </Tag>
                          <Badge status={STATUS_COLORS[project.status] as any} text={<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{project.status}</span>} />
                        </div>
                      </div>

                      <Space onClick={e => e.stopPropagation()} size={4}>
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
                      color: 'var(--color-text-secondary)',
                      fontSize: 13,
                      flex: 1,
                      margin: '6px 0 16px',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {project.description || 'No description provided.'}
                    </p>

                    {/* Application Deployed Link / Base URL */}
                    <Tooltip title="Application Deployed Link / Base Server URL">
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        marginBottom: 16,
                        background: 'var(--color-bg-tertiary)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                        cursor: 'default',
                      }}>
                        <GlobalOutlined style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {project.baseUrl}
                        </span>
                      </div>
                    </Tooltip>

                    {/* Metrics Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ApiOutlined style={{ color: 'var(--color-text-secondary)' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                          {project.endpointCount} {project.endpointCount === 1 ? 'endpoint' : 'endpoints'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Health Score: </span>
                        <span style={{ fontWeight: 800, color: HEALTH_COLOR(project.healthScore || 100), fontSize: 13 }}>
                          {project.healthScore || 100}%
                        </span>
                      </div>
                    </div>

                    <Progress
                      percent={project.healthScore || 100}
                      size="small"
                      showInfo={false}
                      strokeColor={HEALTH_COLOR(project.healthScore || 100)}
                      style={{ marginBottom: 14 }}
                    />

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--color-text-tertiary)', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                      <span>Created {fromNow(project.createdAt)}</span>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text)',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        View Endpoints <ArrowRightOutlined style={{ fontSize: 10 }} />
                      </span>
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
          <Card className="card-modern" style={{ marginBottom: 20 }} styles={{ body: { padding: '14px 20px' } }}>
            <Space wrap size={12}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Search history by project name or deployed link..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{ width: 320 }}
                allowClear
              />
              <Select
                value={historyEnv}
                onChange={setHistoryEnv}
                style={{ width: 170 }}
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
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Loading project history...</div>
            </div>
          ) : historyProjects.length === 0 ? (
            <EmptyState
              title="No Project History"
              description="No deleted or archived projects found. When you delete a project, it will be safely retained here where you can restore it anytime."
              action={
                <Button type="primary" className="btn-primary-gradient" onClick={() => setActiveTab('active')}>
                  Back to Active Projects
                </Button>
              }
            />
          ) : (
            <Card className="card-modern" styles={{ body: { padding: 0 } }}>
              <Table
                dataSource={historyProjects}
                columns={historyColumns}
                rowKey="id"
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 10, showTotal: (t) => `${t} total historical projects`, style: { padding: '12px 20px' } }}
              />
            </Card>
          )}
        </div>
      )}

      {/* ── Modal: Create New Project ─────────────────────────────────────── */}
      <Modal
        title={
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text)' }}>
            Create New Microservice Project
          </div>
        }
        open={isModalOpen}
        onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
        destroyOnClose
        width={600}
        style={{ maxWidth: '95vw', top: 30 }}
        footer={[
          <Button
            key="import"
            icon={<ImportOutlined />}
            onClick={() => {
              setIsModalOpen(false);
              setIsImportModalOpen(true);
            }}
          >
            Import from OpenAPI / Postman
          </Button>,
          <Button key="cancel" onClick={() => { setIsModalOpen(false); form.resetFields(); }}>
            Cancel
          </Button>,
          <Button key="submit" type="primary" className="btn-primary-gradient" loading={isSubmitting} onClick={handleCreateProject}>
            Create Project
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12, marginBottom: 16, borderRadius: 10 }}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
                Have an OpenAPI spec, Swagger URL, or Postman collection?
              </span>
              <Button
                size="small"
                type="link"
                icon={<ImportOutlined />}
                style={{ padding: 0, fontWeight: 700, color: 'var(--color-text)' }}
                onClick={() => {
                  setIsModalOpen(false);
                  setIsImportModalOpen(true);
                }}
              >
                Import APIs Instead →
              </Button>
            </div>
          }
        />

        <Form
          form={form}
          layout="vertical"
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
            label="Application Deployed Link / Base Server URL"
            tooltip="Enter your live deployed application URL (e.g. Vercel, Render, AWS, custom domain) or local server URL (e.g. http://localhost:8000)"
            rules={[
              { required: true, message: 'Please provide an application deployed link or base server URL' },
              { type: 'url', message: 'Must be a valid URL starting with http:// or https://' },
            ]}
          >
            <Input placeholder="https://api.example.com" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Brief summary of the services and routes in this microservice project" />
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

          <Form.Item
            name="bearerToken"
            label="Default Bearer Token / API Secret (Optional)"
            tooltip="If configured, this token will be automatically passed in the Authorization header for all endpoints in this project"
          >
            <Input.Password placeholder="e.g. eyJhbGciOi..." />
          </Form.Item>

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="e.g. orders, checkout" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: API Import & Integration Center ─────────────────────────── */}
      <ApiImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          loadActiveProjects();
          loadHistoryProjects();
        }}
      />
    </div>
  );
}
