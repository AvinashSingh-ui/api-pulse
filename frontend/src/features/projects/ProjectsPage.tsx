import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Input, Select, Button, Tag, Progress,
  Space, Popconfirm, Tooltip, Badge, Modal, Form, message, Spin,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, GlobalOutlined,
  ApiOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState }  from '@/components/common/EmptyState';
import { projectsService } from '@/services/endpoints/projects';
import { fromNow } from '@/utils';
import type { Project } from '@/types';

const ENV_COLORS: Record<string, string> = { production: 'red', staging: 'orange', development: 'blue' };
const STATUS_COLORS: Record<string, string> = { active: 'processing', inactive: 'default', archived: 'default' };
const HEALTH_COLOR = (s: number) => s >= 95 ? '#22c55e' : s >= 80 ? '#f59e0b' : '#ef4444';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<string>('all');
  const [env, setEnv]           = useState<string>('all');

  // New Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const res = await projectsService.list({ search, status: status !== 'all' ? status : undefined });
      setProjects(res.data || []);
    } catch {
      message.error('Failed to load projects from server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [search, status]);

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

      setProjects(prev => [created, ...prev]);
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

  const handleDelete = async (id: string, name: string) => {
    try {
      await projectsService.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      message.success(`Project "${name}" removed successfully.`);
    } catch {
      message.error('Failed to delete project');
    }
  };

  const filtered = projects.filter(p => {
    const matchEnv = env === 'all' || p.environment === env;
    return matchEnv;
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Manage your microservice projects and their monitored API routes"
        breadcrumbs={[{ label: 'Projects' }]}
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadProjects}>Refresh</Button>
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

      {/* Filter toolbar */}
      <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap size={12}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search projects by name or base URL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 140 }}
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Active',       value: 'active' },
              { label: 'Inactive',     value: 'inactive' },
              { label: 'Archived',     value: 'archived' },
            ]}
          />
          <Select
            value={env}
            onChange={setEnv}
            style={{ width: 160 }}
            options={[
              { label: 'All Environments', value: 'all' },
              { label: 'Production',       value: 'production' },
              { label: 'Staging',          value: 'staging' },
              { label: 'Development',      value: 'development' },
            ]}
          />
        </Space>
      </Card>

      {/* Loading state */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#64748b' }}>Loading projects...</div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Projects Yet"
          description={search ? 'No projects match your search filter.' : 'You have not registered any projects yet. Click below to add your first real API project.'}
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Create Your First Project
            </Button>
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(project => (
            <Col xs={24} sm={12} lg={8} key={project.id}>
              <Card
                hoverable
                style={{ height: '100%', borderRadius: 12, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{project.name}</span>
                    <div style={{ marginTop: 2 }}>
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
                      title="Delete Project?"
                      description="All associated endpoints and logs will be permanently removed."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDelete(project.id, project.name)}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>

                {/* Description */}
                <p style={{ color: '#64748b', fontSize: 13, flex: 1, margin: '8px 0 12px', minHeight: 36 }}>
                  {project.description || 'No description provided.'}
                </p>

                {/* Base URL */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: '#475569', fontSize: 12 }}>
                  <GlobalOutlined style={{ color: '#94a3b8' }} />
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.baseUrl}
                  </span>
                </div>

                {/* Health & stats footer */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ApiOutlined /> {project.endpointCount} endpoints
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: HEALTH_COLOR(project.healthScore) }}>
                      {project.healthScore}% health
                    </span>
                  </div>
                  <Progress
                    percent={project.healthScore}
                    strokeColor={HEALTH_COLOR(project.healthScore)}
                    size="small"
                    showInfo={false}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                    <span>Updated {fromNow(project.updatedAt)}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {project.tags.slice(0, 2).map(t => (
                        <Tag key={t} style={{ fontSize: 10, margin: 0 }}>#{t}</Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* New Project Modal */}
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
            label="Base URL"
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
