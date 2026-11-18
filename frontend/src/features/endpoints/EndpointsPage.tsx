import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Table, Input, Select, Button, Space, Tag, Tooltip,
  Progress, Card, Modal, Form, message, notification, Popconfirm, Spin, Typography, InputNumber,
  Badge, Empty,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  ThunderboltOutlined, DeleteOutlined, EyeOutlined,
  EditOutlined, CopyOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
  LinkOutlined, ImportOutlined, RobotOutlined, BulbOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useAppDispatch } from '@/app/hooks';
import { apiSlice } from '@/services/apiSlice';
import { PageHeader }    from '@/components/common/PageHeader';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { EmptyState }    from '@/components/common/EmptyState';
import { ApiImportModal } from '@/components/common/ApiImportModal';
import { endpointsService } from '@/services/endpoints/endpoints';
import { projectsService }  from '@/services/endpoints/projects';
import { aiService }        from '@/services/endpoints/ai';
import { formatResponseTime, fromNow } from '@/utils';
import type { Endpoint, HttpMethod, Project, AIInsight } from '@/types';

const { Text } = Typography;

function buildFullUrl(baseUrl: string, path: string): string {
  const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
  const cleanPath = (path || '').trim();
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  return `${cleanBase}${normalizedPath}`;
}

export default function EndpointsPage() {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [project, setProject] = useState<string>('all');

  // Concurrency tracking: Set of endpoint IDs currently running health checks
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());

  // Register Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createForm] = Form.useForm();
  const selectedCreateProjectId = Form.useWatch('projectId', createForm);
  const enteredCreatePath = Form.useWatch('path', createForm);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editForm] = Form.useForm();
  const enteredEditPath = Form.useWatch('path', editForm);

  // Live Auto-Refresh & Monitoring Telemetry Engine
  const dispatch = useAppDispatch();
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const isAutoRunningRef = useRef<boolean>(false);

  // Gemini AI Diagnosis Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [selectedAiEndpoint, setSelectedAiEndpoint] = useState<Endpoint | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [epsRes, projsRes] = await Promise.all([
        endpointsService.list({
          search: search || undefined,
          method: method !== 'all' ? method : undefined,
          status: status !== 'all' ? status : undefined,
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

  // Silent background refresh for seamless live updates without screen flicker
  const loadDataSilently = useCallback(async () => {
    try {
      const epsRes = await endpointsService.list({
        search: search || undefined,
        method: method !== 'all' ? method : undefined,
        status: status !== 'all' ? status : undefined,
        projectId: project !== 'all' ? project : undefined,
      });
      if (epsRes.data) {
        setEndpoints(epsRes.data);
      }
    } catch {
      // background update silently ignores network blips
    }
  }, [search, method, status, project]);

  // Execute automated or manual live verification cycle
  const runAutomatedCycle = useCallback(async (isManualTrigger = false) => {
    if (isAutoRunningRef.current) return;
    isAutoRunningRef.current = true;
    if (!isManualTrigger) {
      setIsAutoRunning(true);
    } else {
      setIsCheckingAll(true);
    }

    try {
      const targetProjId = project !== 'all' ? project : undefined;
      const res = await endpointsService.checkAll(targetProjId);

      // 1. Immediately invalidate RTK query tags to sync notifications & alerts bell in real-time
      dispatch(apiSlice.util.invalidateTags(['Notifications', 'HealthStats', 'Alerts']));

      // 2. Fetch fresh endpoints list to update the table immediately with real live measurements
      await loadDataSilently();

      // 3. Display live completion toast
      const totalChecked = res.totalChecked ?? res.results?.length ?? 0;
      const healthy = res.healthyCount ?? res.results?.filter((r: any) => r.status === 'healthy').length ?? 0;
      const degraded = res.degradedCount ?? res.results?.filter((r: any) => r.status === 'degraded').length ?? 0;
      const unhealthy = res.unhealthyCount ?? res.results?.filter((r: any) => r.status === 'down' || r.status === 'unhealthy').length ?? 0;
      const issues = degraded + unhealthy;

      if (isManualTrigger) {
        message.success(res.message || `Health checks executed for all endpoints.`);
      } else {
        notification.open({
          key: 'automated-cycle-notice',
          icon: <ThunderboltOutlined style={{ color: issues > 0 ? '#f59e0b' : '#10b981' }} />,
          message: 'Live Monitoring Cycle Complete',
          description: (
            <div>
              <div style={{ color: '#334155', fontSize: 13, marginBottom: 4 }}>
                Automated health tests executed for <strong>{totalChecked}</strong> endpoint{totalChecked !== 1 ? 's' : ''}.
              </div>
              <Space size={6}>
                <Tag color="success">{healthy} Healthy</Tag>
                {issues > 0 ? (
                  <Tag color="error">{issues} Issue{issues > 1 ? 's' : ''} Detected</Tag>
                ) : (
                  <Tag color="cyan">All Systems Operational</Tag>
                )}
              </Space>
            </div>
          ),
          placement: 'topRight',
          duration: 3.5,
        });
      }
    } catch (err: any) {
      if (isManualTrigger) {
        message.error(err.response?.data?.message || 'Failed to run batch health checks');
      }
    } finally {
      isAutoRunningRef.current = false;
      setIsAutoRunning(false);
      setIsCheckingAll(false);
    }
  }, [project, dispatch, loadDataSilently]);

  // Automated live cycle timer
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          runAutomatedCycle(false);
          return autoRefreshSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, runAutomatedCycle]);

  const handleRunAllChecks = async () => {
    await runAutomatedCycle(true);
    setCountdown(autoRefreshSec > 0 ? autoRefreshSec : 60);
  };

  const handleOpenAiDiagnosis = async (ep: Endpoint, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAiEndpoint(ep);
    setIsAiModalOpen(true);
    setIsLoadingAi(true);
    setAiInsight(null);
    try {
      const insights = await aiService.analyzeEndpoint(ep.id);
      if (insights && insights.length > 0) {
        setAiInsight(insights[0]);
      } else {
        message.info('No diagnosis generated for this endpoint.');
      }
    } catch {
      message.error('Failed to generate AI diagnosis');
    } finally {
      setIsLoadingAi(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, method, status, project]);

  const handleOpenCreateModal = () => {
    if (projects.length === 0) {
      message.warning('Please create a project first before registering endpoints.');
      navigate('/projects');
      return;
    }
    createForm.setFieldsValue({
      projectId: project !== 'all' ? project : projects[0]?.id,
      method: 'GET',
      path: '/api/v1/health',
      name: '',
      interval: 60,
      expectedStatus: 200,
      timeout: 5000,
      latencyThresholdMs: 500,
      tags: [],
    });
    setIsCreateModalOpen(true);
  };

  const handleRegisterEndpoint = async () => {
    try {
      const values = await createForm.validateFields();
      setIsSubmittingCreate(true);
      const cleanPath = values.path.trim().startsWith('/') ? values.path.trim() : `/${values.path.trim()}`;

      const created = await endpointsService.create({
        projectId: values.projectId,
        name: values.name.trim(),
        path: cleanPath,
        method: values.method,
        interval: values.interval || 60,
        expectedStatus: values.expectedStatus || 200,
        timeout: values.timeout || 5000,
        latencyThresholdMs: values.latencyThresholdMs || 500,
        tags: values.tags || [],
      });

      setEndpoints(prev => [created, ...prev]);
      setIsCreateModalOpen(false);
      createForm.resetFields();
      message.success(`Endpoint "${created.method} ${created.path}" registered successfully!`);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || err.message || 'Failed to create endpoint');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (ep: Endpoint, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEndpoint(ep);
    editForm.setFieldsValue({
      name: ep.name,
      method: ep.method,
      path: ep.path,
      interval: ep.interval || 60,
      expectedStatus: ep.expectedStatus || 200,
      timeout: ep.timeout || 5000,
      latencyThresholdMs: ep.latencyThresholdMs || 500,
      tags: ep.tags || [],
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateEndpoint = async () => {
    if (!editingEndpoint) return;
    try {
      const values = await editForm.validateFields();
      setIsSubmittingEdit(true);
      const cleanPath = values.path.trim().startsWith('/') ? values.path.trim() : `/${values.path.trim()}`;

      const updated = await endpointsService.update(editingEndpoint.id, {
        name: values.name.trim(),
        method: values.method,
        path: cleanPath,
        interval: values.interval,
        expectedStatus: values.expectedStatus,
        timeout: values.timeout,
        latencyThresholdMs: values.latencyThresholdMs,
        tags: values.tags || [],
      });

      setEndpoints(prev => prev.map(ep => ep.id === editingEndpoint.id ? { ...ep, ...updated } : ep));
      setIsEditModalOpen(false);
      setEditingEndpoint(null);
      message.success(`Endpoint "${updated.method} ${updated.path}" updated successfully!`);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || err.message || 'Failed to update endpoint');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleRunCheck = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent duplicate in-flight requests
    if (checkingIds.has(id)) {
      message.info('Health check is already running for this endpoint.');
      return;
    }

    setCheckingIds(prev => new Set(prev).add(id));
    try {
      const res = await endpointsService.checkNow(id);
      
      setEndpoints(prev => prev.map(ep => {
        if (ep.id === id) {
          return {
            ...ep,
            responseTimeP50: res.responseTimeP50 ?? res.responseTime,
            responseTimeP95: res.responseTimeP95 ?? Math.round(res.responseTime * 1.5),
            uptime: res.uptime ?? ep.uptime,
            healthScore: res.healthScore ?? ep.healthScore,
            degradationReason: res.degradationReason,
            lastStatusCode: res.statusCode,
            lastChecked: new Date().toISOString(),
            status: res.status as Endpoint['status'],
          };
        }
        return ep;
      }));

      const isUnhealthyOrDegraded = res.status === 'down' || res.status === 'degraded' || (res.statusCode && res.statusCode >= 400);

      if (isUnhealthyOrDegraded) {
        notification.warning({
          message: `Health Check: ${res.status.toUpperCase()} (Score: ${res.healthScore ?? 'N/A'}/100)`,
          description: (
            <div>
              <div>HTTP {res.statusCode || 'Error'} in {res.responseTime}ms.</div>
              {res.degradationReason && <div style={{ color: '#ef4444', marginTop: 4 }}>{res.degradationReason}</div>}
            </div>
          ),
          duration: 4,
        });
      } else {
        message.success(`Check passed: HTTP ${res.statusCode || '200'} OK in ${res.responseTime}ms (Score: ${res.healthScore ?? 100}/100)`);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Health check execution failed');
    } finally {
      setCheckingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  const handleCopyUrl = (fullUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullUrl);
    message.success('URL copied to clipboard!');
  };

  // Resolve target project for URL previews
  const activeCreateProject = projects.find(p => p.id === (selectedCreateProjectId || projects[0]?.id));
  const activeEditProject = editingEndpoint ? projects.find(p => p.id === editingEndpoint.projectId) : null;

  const columns: ColumnsType<Endpoint> = [
    {
      title: 'Endpoint Name & Path',
      key: 'endpoint',
      width: 290,
      render: (_, r) => {
        const proj = projects.find(p => p.id === r.projectId);
        const fullUrl = proj ? buildFullUrl(proj.baseUrl, r.path) : r.path;
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <HttpMethodTag method={r.method} size="sm" />
              <Tooltip title={`Full URL: ${fullUrl} (Click to copy)`}>
                <span
                  onClick={e => handleCopyUrl(fullUrl, e)}
                  style={{
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#0958d9',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {r.path}
                </span>
              </Tooltip>
              <Tooltip title="Copy full URL">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined style={{ fontSize: 11, color: '#94a3b8' }} />}
                  onClick={e => handleCopyUrl(fullUrl, e)}
                  style={{ width: 20, height: 20, minWidth: 20, padding: 0 }}
                />
              </Tooltip>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {r.name} {proj ? `• ${proj.name}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      title: 'HTTP Status',
      key: 'statusCode',
      width: 120,
      render: (_, r) => {
        const code = r.lastStatusCode;
        if (!code) {
          return <Tag color="default">Pending</Tag>;
        }
        let tagColor = 'success';
        if (code >= 500) tagColor = 'error';
        else if (code >= 400) tagColor = 'warning';
        else if (code >= 300) tagColor = 'processing';

        return (
          <Tooltip title={`Last recorded HTTP response: ${code} (${r.status})`}>
            <Tag color={tagColor} style={{ fontWeight: 600, fontFamily: 'monospace' }}>
              HTTP {code}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Health Status',
      key: 'health',
      width: 150,
      render: (_, r) => {
        const score = r.healthScore ?? (r.status === 'healthy' ? 100 : r.status === 'degraded' ? 70 : 20);
        let color = 'success';
        let label = 'Healthy';
        let icon = <CheckCircleOutlined />;

        if (r.status === 'down' || score < 50) {
          color = 'error';
          label = 'Unhealthy';
          icon = <CloseCircleOutlined />;
        } else if (r.status === 'degraded' || (score >= 50 && score < 90)) {
          color = 'warning';
          label = 'Degraded';
          icon = <WarningOutlined />;
        }

        const tooltipContent = (
          <div style={{ padding: '2px 4px' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>API Health Score: {score}/100</div>
            {r.degradationReason && (
              <div style={{ color: '#ffccc7', fontSize: 12 }}>
                Reason: {r.degradationReason}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 4 }}>
              Threshold: Latency ≤ {r.latencyThresholdMs || 500}ms, HTTP {r.expectedStatus || 200}
            </div>
          </div>
        );

        return (
          <Tooltip title={tooltipContent}>
            <Tag color={color} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, cursor: 'help' }}>
              {icon} {label} ({score})
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <Tooltip title="Real measured response times: P50 (median) / P95 (95th percentile)">
          <span>P50 / P95 <InfoCircleOutlined style={{ fontSize: 11, color: '#94a3b8' }} /></span>
        </Tooltip>
      ),
      key: 'rt',
      width: 140,
      render: (_, r) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{formatResponseTime(r.responseTimeP50)}</span>
          <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
          <span style={{ color: r.responseTimeP95 > 500 ? '#ef4444' : r.responseTimeP95 > 200 ? '#f59e0b' : '#0958d9', fontWeight: 600 }}>
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
      render: (v: number) => {
        const val = typeof v === 'number' ? v : 100;
        return (
          <Tooltip title={`Uptime calculated from historical health checks: ${val.toFixed(2)}%`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress percent={val} size="small" showInfo={false} strokeColor={val >= 99 ? '#22c55e' : val >= 95 ? '#f59e0b' : '#ef4444'} style={{ width: 55, margin: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{val.toFixed(1)}%</span>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Last Check',
      dataIndex: 'lastChecked',
      key: 'lastChecked',
      width: 120,
      render: (v: string) => (
        <Tooltip title={v ? new Date(v).toLocaleString() : 'Never'}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{fromNow(v)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, r) => {
        const isRunning = checkingIds.has(r.id);
        const hasIssue = r.status === 'down' || r.status === 'degraded' || (r.lastStatusCode && r.lastStatusCode >= 400);
        return (
          <Space size={4} onClick={e => e.stopPropagation()}>
            <Tooltip title="Run live check now">
              <Button
                size="small"
                icon={<ThunderboltOutlined style={{ color: isRunning ? '#94a3b8' : '#0958d9' }} />}
                loading={isRunning}
                disabled={isRunning}
                onClick={(e) => handleRunCheck(r.id, e)}
              />
            </Tooltip>
            <Tooltip title="AI Root Cause Analysis & Fix (Powered by Gemini)">
              <Button
                size="small"
                style={hasIssue ? { borderColor: '#8b5cf6', background: '#f5f3ff' } : {}}
                icon={<RobotOutlined style={{ color: hasIssue ? '#7c3aed' : '#8b5cf6' }} />}
                onClick={(e) => handleOpenAiDiagnosis(r, e)}
              />
            </Tooltip>
            <Tooltip title="View endpoint details">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/endpoints/${r.id}`)}
              />
            </Tooltip>
            <Tooltip title="Edit endpoint">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => handleOpenEditModal(r, e)}
              />
            </Tooltip>
            <Tooltip title="Delete endpoint">
              <Popconfirm
                title="Delete endpoint?"
                description={`Permanently remove ${r.method} ${r.path}?`}
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(r.id, r.name)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Endpoints"
        subtitle="Real-time API monitoring, health scoring, and latency telemetry"
        breadcrumbs={[{ label: 'Endpoints' }]}
        actions={
          <Space wrap size={10}>
            {autoRefreshSec > 0 ? (
              isAutoRunning ? (
                <Badge
                  status="processing"
                  color="#0284c7"
                  text={
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <SyncOutlined spin /> Live Testing...
                    </span>
                  }
                />
              ) : (
                <Badge
                  status="processing"
                  color="#22c55e"
                  text={
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>
                      Live: {countdown}s
                    </span>
                  }
                />
              )
            ) : (
              <Badge
                status="default"
                text={<span style={{ fontSize: 13, color: '#94a3b8' }}>Live: Paused</span>}
              />
            )}

            <Select
              size="middle"
              value={autoRefreshSec}
              onChange={val => {
                setAutoRefreshSec(val);
                setCountdown(val);
              }}
              style={{ width: 135 }}
              options={[
                { label: 'Auto (60s)', value: 60 },
                { label: 'Fast (30s)', value: 30 },
                { label: 'Rapid (15s)', value: 15 },
                { label: 'Paused',     value: 0 },
              ]}
            />

            <Button
              icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
              onClick={handleRunAllChecks}
              loading={isCheckingAll}
            >
              Run All Checks
            </Button>

            <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setIsImportModalOpen(true)}
            >
              Import APIs
            </Button>
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
            style={{ width: 140 }}
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Healthy (90-100)', value: 'healthy' },
              { label: 'Degraded (50-89)', value: 'degraded' },
              { label: 'Unhealthy (0-49)', value: 'unhealthy' },
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
      ) : endpoints.length === 0 ? (
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
            dataSource={endpoints}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 15, showTotal: (t) => `${t} total endpoints` }}
            scroll={{ x: 1000 }}
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
        open={isCreateModalOpen}
        onOk={handleRegisterEndpoint}
        onCancel={() => { setIsCreateModalOpen(false); createForm.resetFields(); }}
        confirmLoading={isSubmittingCreate}
        okText="Register Endpoint"
        cancelText="Cancel"
        destroyOnClose
        width={580}
        style={{ maxWidth: '95vw' }}
      >
        <Form
          form={createForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="projectId"
            label="Target Project"
            rules={[{ required: true, message: 'Please select a target project' }]}
          >
            <Select
              options={projects.map(p => ({
                label: `${p.name} (${p.baseUrl})`,
                value: p.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Endpoint Friendly Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="e.g. User Profile Service" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item name="method" label="Method" style={{ width: 130 }} rules={[{ required: true }]}>
              <Select options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ label: m, value: m }))} />
            </Form.Item>
            <Form.Item
              name="path"
              label="Endpoint Path"
              style={{ flex: 1 }}
              rules={[
                { required: true, message: 'Endpoint path required' },
                {
                  validator: async (_, val) => {
                    if (!val) return;
                    if (val.includes(' ')) throw new Error('Path cannot contain spaces');
                  },
                },
              ]}
              extra={
                activeCreateProject && (
                  <div style={{ fontSize: 12, color: '#0958d9', marginTop: 4, wordBreak: 'break-all' }}>
                    <LinkOutlined style={{ marginRight: 4 }} />
                    Full URL: <strong>{buildFullUrl(activeCreateProject.baseUrl, enteredCreatePath || '/')}</strong>
                  </div>
                )
              }
            >
              <Input placeholder="/api/v1/users/:id" />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item name="interval" label="Check Interval" style={{ flex: 1 }}>
              <Select options={[
                { label: '15 seconds (High Frequency)', value: 15 },
                { label: '30 seconds', value: 30 },
                { label: '60 seconds (Standard)', value: 60 },
                { label: '300 seconds (5 mins)', value: 300 },
              ]} />
            </Form.Item>
            <Form.Item name="expectedStatus" label="Expected HTTP Status" style={{ flex: 1 }}>
              <Select options={[200, 201, 204, 301, 302, 401, 404].map(c => ({ label: `HTTP ${c}`, value: c }))} />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item
              name="latencyThresholdMs"
              label={
                <Tooltip title="Responses slower than this threshold degrade the Health Score even if HTTP 200 is returned.">
                  <span>Latency Threshold (ms) <InfoCircleOutlined style={{ color: '#0958d9' }} /></span>
                </Tooltip>
              }
              style={{ flex: 1 }}
            >
              <InputNumber min={50} max={10000} step={50} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="timeout" label="Timeout (ms)" style={{ flex: 1 }}>
              <InputNumber min={500} max={30000} step={500} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" placeholder="e.g. auth, payments, critical" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Endpoint Modal */}
      <Modal
        title={`Edit Endpoint: ${editingEndpoint?.method} ${editingEndpoint?.path}`}
        open={isEditModalOpen}
        onOk={handleUpdateEndpoint}
        onCancel={() => { setIsEditModalOpen(false); setEditingEndpoint(null); }}
        confirmLoading={isSubmittingEdit}
        okText="Save Changes"
        cancelText="Cancel"
        destroyOnClose
        width={580}
        style={{ maxWidth: '95vw' }}
      >
        <Form
          form={editForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Endpoint Friendly Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item name="method" label="Method" style={{ width: 130 }} rules={[{ required: true }]}>
              <Select options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ label: m, value: m }))} />
            </Form.Item>
            <Form.Item
              name="path"
              label="Endpoint Path"
              style={{ flex: 1 }}
              rules={[
                { required: true, message: 'Endpoint path required' },
                {
                  validator: async (_, val) => {
                    if (!val) return;
                    if (val.includes(' ')) throw new Error('Path cannot contain spaces');
                  },
                },
              ]}
              extra={
                activeEditProject && (
                  <div style={{ fontSize: 12, color: '#0958d9', marginTop: 4, wordBreak: 'break-all' }}>
                    <LinkOutlined style={{ marginRight: 4 }} />
                    Full URL: <strong>{buildFullUrl(activeEditProject.baseUrl, enteredEditPath || editingEndpoint?.path || '/')}</strong>
                  </div>
                )
              }
            >
              <Input />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item name="interval" label="Check Interval" style={{ flex: 1 }}>
              <Select options={[
                { label: '15 seconds', value: 15 },
                { label: '30 seconds', value: 30 },
                { label: '60 seconds', value: 60 },
                { label: '300 seconds', value: 300 },
              ]} />
            </Form.Item>
            <Form.Item name="expectedStatus" label="Expected HTTP Status" style={{ flex: 1 }}>
              <Select options={[200, 201, 204, 301, 302, 401, 404].map(c => ({ label: `HTTP ${c}`, value: c }))} />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item
              name="latencyThresholdMs"
              label={
                <Tooltip title="Responses slower than this threshold degrade the Health Score even if HTTP 200 is returned.">
                  <span>Latency Threshold (ms) <InfoCircleOutlined style={{ color: '#0958d9' }} /></span>
                </Tooltip>
              }
              style={{ flex: 1 }}
            >
              <InputNumber min={50} max={10000} step={50} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="timeout" label="Timeout (ms)" style={{ flex: 1 }}>
              <InputNumber min={500} max={30000} step={500} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="tags" label="Tags">
            <Select mode="tags" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: API Import & Integration Center ─────────────────────────── */}
      <ApiImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadData}
      />

      {/* ── Modal: Gemini AI Root Cause & Fix Diagnosis ───────────────────── */}
      <Modal
        open={isAiModalOpen}
        onCancel={() => { setIsAiModalOpen(false); setSelectedAiEndpoint(null); setAiInsight(null); }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RobotOutlined style={{ color: '#8b5cf6', fontSize: 22 }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                AI Root Cause Analysis & Fix
              </div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                Powered by Google Gemini • Live Telemetry Diagnosis
              </div>
            </div>
          </div>
        }
        width={720}
        style={{ maxWidth: '95vw', top: 30 }}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsAiModalOpen(false)}>
            Done
          </Button>,
        ]}
      >
        {selectedAiEndpoint && (
          <div style={{ marginTop: 12 }}>
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HttpMethodTag method={selectedAiEndpoint.method} size="sm" />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                  {selectedAiEndpoint.path}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag color={selectedAiEndpoint.status === 'healthy' ? 'success' : selectedAiEndpoint.status === 'degraded' ? 'warning' : 'error'} style={{ fontWeight: 700 }}>
                  {selectedAiEndpoint.status.toUpperCase()} ({selectedAiEndpoint.healthScore ?? 100}%)
                </Tag>
                {selectedAiEndpoint.lastStatusCode && (
                  <Tag color={selectedAiEndpoint.lastStatusCode >= 400 ? 'red' : 'green'}>
                    HTTP {selectedAiEndpoint.lastStatusCode}
                  </Tag>
                )}
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  P50: {selectedAiEndpoint.responseTimeP50 || 0}ms
                </span>
              </div>
            </div>

            {isLoadingAi ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 14, color: '#475569', fontWeight: 500 }}>
                  Gemini is analyzing endpoint telemetry, status code patterns, and latency logs...
                </div>
              </div>
            ) : aiInsight ? (
              <div>
                {/* Title & Description */}
                <Card size="small" style={{ borderRadius: 8, marginBottom: 14, borderLeft: '4px solid #8b5cf6' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>
                    {aiInsight.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                    {aiInsight.description}
                  </div>
                </Card>

                {/* Likely Causes */}
                {aiInsight.likelyCauses && aiInsight.likelyCauses.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                      Likely Causes:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {aiInsight.likelyCauses.map((c, i) => (
                        <div key={i} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.cause}</span>
                            <Tag color={c.confidence === 'high' ? 'red' : 'orange'} style={{ fontSize: 10, textTransform: 'uppercase' }}>
                              {c.confidence} Confidence
                            </Tag>
                          </div>
                          {c.evidence && <div style={{ color: '#64748b' }}>Evidence: {c.evidence}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Checks */}
                {aiInsight.suggestedChecks && aiInsight.suggestedChecks.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                      Diagnostic Checks:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                      {aiInsight.suggestedChecks.map((chk, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{chk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Fix */}
                {aiInsight.suggestedFix && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Suggested Code / Architecture Fix:
                      </span>
                      {aiInsight.suggestedFix.codeSnippet && (
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(aiInsight.suggestedFix?.codeSnippet || '');
                            message.success('Code fix copied to clipboard!');
                          }}
                        >
                          Copy Code
                        </Button>
                      )}
                    </div>
                    {aiInsight.suggestedFix.summary && (
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, fontStyle: 'italic' }}>
                        {aiInsight.suggestedFix.summary}
                      </div>
                    )}
                    {aiInsight.suggestedFix.codeSnippet && (
                      <pre style={{
                        background: '#0f172a',
                        color: '#f8fafc',
                        padding: 12,
                        borderRadius: 8,
                        fontSize: 12,
                        overflowX: 'auto',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>
                        <code>{aiInsight.suggestedFix.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Empty description="No AI insights found for this endpoint." />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
