import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Table, Input, Select, Button, Space, Tag, Tooltip,
  Progress, Card, Modal, Form, message, notification, Popconfirm, Spin, Typography, InputNumber,
  Badge, Empty, Divider, Segmented,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  ThunderboltOutlined, DeleteOutlined, EyeOutlined,
  EditOutlined, CopyOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
  LinkOutlined, ImportOutlined, RobotOutlined, BulbOutlined,
  SyncOutlined, FolderOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useAppDispatch } from '@/app/hooks';
import { apiSlice } from '@/services/apiSlice';
import { PageHeader }    from '@/components/common/PageHeader';
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
  const selectedCreateMethod = Form.useWatch('method', createForm) || 'GET';

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editForm] = Form.useForm();
  const enteredEditPath = Form.useWatch('path', editForm);
  const selectedEditMethod = Form.useWatch('method', editForm) || editingEndpoint?.method || 'GET';

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
          pageSize: 1000,
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
        pageSize: 1000,
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
      if (isManualTrigger) {
        message.success(`Verified ${res.totalChecked} endpoints: ${res.healthyCount ?? 0} healthy, ${res.degradedCount ?? 0} degraded, ${res.unhealthyCount ?? 0} outages`);
      }
    } catch (err: any) {
      if (isManualTrigger) {
        message.error(err.response?.data?.message || 'Failed to complete full endpoint check cycle');
      }
    } finally {
      isAutoRunningRef.current = false;
      setIsAutoRunning(false);
      setIsCheckingAll(false);
      setCountdown(autoRefreshSec);
    }
  }, [autoRefreshSec, dispatch, loadDataSilently, project]);

  // Handle countdown interval and automated trigger
  useEffect(() => {
    if (autoRefreshSec <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          runAutomatedCycle(false);
          return autoRefreshSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshSec, runAutomatedCycle]);

  // Reload when manual filters change
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, status, project]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      loadDataSilently();
    }, 350);
    return () => clearTimeout(handler);
  }, [search, loadDataSilently]);

  const handleRunAllChecks = () => {
    runAutomatedCycle(true);
  };

  const handleOpenAiDiagnosis = async (ep: Endpoint, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAiEndpoint(ep);
    setIsAiModalOpen(true);
    setIsLoadingAi(true);
    setAiInsight(null);

    try {
      const insights = await aiService.analyzeEndpoint(ep.id);
      setAiInsight(Array.isArray(insights) && insights.length > 0 ? insights[0] : null);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to generate AI diagnosis. Please verify your Gemini API key in Settings.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleOpenCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({
      method: 'GET',
      interval: 60,
      expectedStatus: 200,
      timeout: 5000,
      latencyThresholdMs: 500,
      projectId: projects[0]?.id,
    });
    setIsCreateModalOpen(true);
  };

  const handleRegisterEndpoint = async () => {
    try {
      const values = await createForm.validateFields();
      setIsSubmittingCreate(true);
      const cleanPath = values.path.trim().startsWith('/') ? values.path.trim() : `/${values.path.trim()}`;

      let parsedHeaders: Record<string, string> = {};
      if (values.headersText && values.headersText.trim()) {
        try {
          parsedHeaders = JSON.parse(values.headersText.trim());
        } catch {
          message.error('Invalid JSON syntax in Request Headers');
          setIsSubmittingCreate(false);
          return;
        }
      }

      const created = await endpointsService.create({
        projectId: values.projectId,
        name: values.name.trim(),
        method: values.method,
        path: cleanPath,
        interval: values.interval || 60,
        expectedStatus: values.expectedStatus || 200,
        timeout: values.timeout || 5000,
        latencyThresholdMs: values.latencyThresholdMs || 500,
        headers: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : {},
        body: values.body !== undefined ? values.body.trim() : undefined,
        tags: values.tags || [],
      });

      setEndpoints(prev => [created, ...prev]);
      setIsCreateModalOpen(false);
      createForm.resetFields();
      message.success(`Endpoint "${created.method} ${created.path}" registered successfully!`);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || err.message || 'Failed to register endpoint');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (ep: Endpoint, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingEndpoint(ep);

    let initialHeadersText = '';
    if (ep.headers) {
      try {
        initialHeadersText = typeof ep.headers === 'string'
          ? JSON.stringify(JSON.parse(ep.headers), null, 2)
          : JSON.stringify(ep.headers, null, 2);
      } catch {
        initialHeadersText = String(ep.headers);
      }
    }

    editForm.setFieldsValue({
      name: ep.name,
      method: ep.method,
      path: ep.path,
      interval: ep.interval || 60,
      expectedStatus: ep.expectedStatus || 200,
      timeout: ep.timeout || 5000,
      latencyThresholdMs: ep.latencyThresholdMs || 500,
      headersText: initialHeadersText,
      body: ep.body || '',
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

      let parsedHeaders: Record<string, string> = {};
      if (values.headersText && values.headersText.trim()) {
        try {
          parsedHeaders = JSON.parse(values.headersText.trim());
        } catch {
          message.error('Invalid JSON syntax in Request Headers');
          setIsSubmittingEdit(false);
          return;
        }
      }

      const updated = await endpointsService.update(editingEndpoint.id, {
        name: values.name.trim(),
        method: values.method,
        path: cleanPath,
        interval: values.interval,
        expectedStatus: values.expectedStatus,
        timeout: values.timeout,
        latencyThresholdMs: values.latencyThresholdMs,
        headers: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : {},
        body: values.body !== undefined ? values.body.trim() : undefined,
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

      dispatch(apiSlice.util.invalidateTags(['Notifications', 'HealthStats', 'Alerts']));
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

  // Status counts for Segmented filter
  const totalCount = endpoints.length;
  const healthyCount = endpoints.filter(e => e.status === 'healthy').length;
  const degradedCount = endpoints.filter(e => e.status === 'degraded').length;
  const unhealthyCount = endpoints.filter(e => e.status === 'down').length;

  // Resolve target project for URL previews
  const activeCreateProject = projects.find(p => p.id === (selectedCreateProjectId || projects[0]?.id));
  const activeEditProject = editingEndpoint ? projects.find(p => p.id === editingEndpoint.projectId) : null;

  const getMethodBadgeClass = (m: string) => {
    const lower = m.toLowerCase();
    return `method-pill-${lower}`;
  };

  const columns: ColumnsType<Endpoint> = [
    {
      title: 'Endpoint & Route',
      key: 'endpoint',
      width: 320,
      render: (_, r) => {
        const proj = projects.find(p => p.id === r.projectId);
        const fullUrl = proj ? buildFullUrl(proj.baseUrl, r.path) : r.path;
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Tag className={getMethodBadgeClass(r.method)} style={{ margin: 0, padding: '2px 8px', fontSize: 11, borderRadius: 6 }}>
                {r.method}
              </Tag>
              <Tooltip title={`Full URL: ${fullUrl} (Click to copy)`}>
                <span
                  onClick={e => handleCopyUrl(fullUrl, e)}
                  style={{
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--color-text)',
                    fontWeight: 700,
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
                  icon={<CopyOutlined style={{ fontSize: 12, color: '#94a3b8' }} />}
                  onClick={e => handleCopyUrl(fullUrl, e)}
                  style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
                />
              </Tooltip>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{r.name}</span>
              {proj && (
                <>
                  <span style={{ color: 'var(--color-border)' }}>•</span>
                  <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{proj.name}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'HTTP Status',
      key: 'statusCode',
      width: 130,
      render: (_, r) => {
        const code = r.lastStatusCode;
        if (!code) {
          return <Tag color="default" style={{ fontWeight: 600 }}>AWAITING</Tag>;
        }
        let tagColor = 'success';
        if (code >= 500) tagColor = 'error';
        else if (code >= 400) tagColor = 'warning';
        else if (code >= 300) tagColor = 'processing';

        return (
          <Tooltip title={`Last recorded HTTP response: ${code} (${r.status})`}>
            <Tag color={tagColor} style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', padding: '2px 8px' }}>
              HTTP {code}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Health Status',
      key: 'health',
      width: 160,
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
          <div style={{ padding: '4px 6px' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Health Score: {score}/100</div>
            {r.degradationReason && (
              <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 4 }}>
                {r.degradationReason}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Threshold: ≤ {r.latencyThresholdMs || 500}ms, HTTP {r.expectedStatus || 200}
            </div>
          </div>
        );

        return (
          <Tooltip title={tooltipContent}>
            <Tag color={color} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, padding: '3px 8px' }}>
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
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ color: '#10b981', fontWeight: 700 }}>{formatResponseTime(r.responseTimeP50)}</span>
          <span style={{ color: 'var(--color-border)', margin: '0 4px' }}>/</span>
          <span style={{ color: r.responseTimeP95 > 500 ? '#ef4444' : r.responseTimeP95 > 200 ? '#f59e0b' : 'var(--color-text)', fontWeight: 700 }}>
            {formatResponseTime(r.responseTimeP95)}
          </span>
        </span>
      ),
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 140,
      render: (v: number) => {
        const val = typeof v === 'number' ? v : 100;
        return (
          <Tooltip title={`Uptime calculated from historical health checks: ${val.toFixed(2)}%`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={val}
                size="small"
                showInfo={false}
                strokeColor={val >= 99 ? '#10b981' : val >= 95 ? '#f59e0b' : '#f43f5e'}
                style={{ width: 60, margin: 0 }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{val.toFixed(1)}%</span>
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
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{fromNow(v)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, r) => {
        const isRunning = checkingIds.has(r.id);
        const hasIssue = r.status === 'down' || r.status === 'degraded' || (r.lastStatusCode && r.lastStatusCode >= 400);

        return (
          <Space size={6} onClick={e => e.stopPropagation()}>
            {/* AI Diagnosis CTA */}
            {hasIssue ? (
              <Button
                size="small"
                className="btn-ai-gradient"
                icon={<RobotOutlined />}
                onClick={(e) => handleOpenAiDiagnosis(r, e)}
                style={{ fontSize: 11, padding: '0 8px', height: 28, borderRadius: 6 }}
              >
                AI Fix
              </Button>
            ) : (
              <Tooltip title="AI Root Cause Analysis (Powered by Gemini)">
                <Button
                  size="small"
                  icon={<RobotOutlined style={{ color: 'var(--color-text)' }} />}
                  onClick={(e) => handleOpenAiDiagnosis(r, e)}
                  style={{ borderRadius: 6, height: 28, width: 28 }}
                />
              </Tooltip>
            )}

            {/* Run health check */}
            <Tooltip title="Execute synthetic check now">
              <Button
                size="small"
                icon={<ThunderboltOutlined style={{ color: isRunning ? 'var(--color-text-tertiary)' : 'var(--color-text)' }} />}
                loading={isRunning}
                disabled={isRunning}
                onClick={(e) => handleRunCheck(r.id, e)}
                style={{ borderRadius: 6, height: 28, width: 28 }}
              />
            </Tooltip>

            {/* View Details */}
            <Tooltip title="View endpoint telemetry">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/endpoints/${r.id}`)}
                style={{ borderRadius: 6, height: 28, width: 28 }}
              />
            </Tooltip>

            {/* Edit Endpoint */}
            <Tooltip title="Edit endpoint">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => handleOpenEditModal(r, e)}
                style={{ borderRadius: 6, height: 28, width: 28 }}
              />
            </Tooltip>

            {/* Delete Endpoint */}
            <Tooltip title="Delete endpoint">
              <Popconfirm
                title="Delete endpoint?"
                description={`Permanently remove ${r.method} ${r.path}?`}
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(r.id, r.name)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6, height: 28, width: 28 }} />
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
        title="Endpoints & Routes"
        subtitle="Real-time synthetic API monitoring, latency telemetry, and AI root cause diagnosis"
        breadcrumbs={[{ label: 'Endpoints' }]}
        actions={
          <Space wrap size={10} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Live Auto-Refresh Heartbeat Bar */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                background: '#ffffff',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                borderRadius: 10,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              }}
            >
              {autoRefreshSec > 0 ? (
                isAutoRunning ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <SyncOutlined spin /> Running...
                  </span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="live-dot-pulse" /> Live Pulse: {countdown}s
                  </span>
                )
              ) : (
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Pulse: Paused</span>
              )}

              <Segmented
                size="small"
                value={autoRefreshSec}
                onChange={val => {
                  setAutoRefreshSec(Number(val));
                  setCountdown(Number(val));
                }}
                options={[
                  { label: '60s', value: 60 },
                  { label: '30s', value: 30 },
                  { label: '15s', value: 15 },
                  { label: 'Off', value: 0 },
                ]}
              />
            </div>

            <Button
              className="btn-gold-gradient"
              icon={<ThunderboltOutlined />}
              onClick={handleRunAllChecks}
              loading={isCheckingAll}
            >
              Run All Checks
            </Button>

            <Button icon={<ReloadOutlined />} onClick={loadData}>
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
              onClick={handleOpenCreateModal}
            >
              Add Endpoint
            </Button>
          </Space>
        }
      />

      {/* Spacious, Elegant Filter Bar */}
      <Card
        className="card-modern"
        style={{ marginBottom: 20 }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          {/* Segmented Status Selector */}
          <Segmented
            value={status}
            onChange={val => setStatus(String(val))}
            options={[
              {
                label: (
                  <div style={{ padding: '2px 8px', fontWeight: 700 }}>
                    All <Badge count={totalCount} style={{ backgroundColor: '#64748b', marginLeft: 4 }} />
                  </div>
                ),
                value: 'all',
              },
              {
                label: (
                  <div style={{ padding: '2px 8px', fontWeight: 700 }}>
                    Healthy <Badge count={healthyCount} style={{ backgroundColor: '#10b981', marginLeft: 4 }} />
                  </div>
                ),
                value: 'healthy',
              },
              {
                label: (
                  <div style={{ padding: '2px 8px', fontWeight: 700 }}>
                    Degraded <Badge count={degradedCount} style={{ backgroundColor: '#f59e0b', marginLeft: 4 }} />
                  </div>
                ),
                value: 'degraded',
              },
              {
                label: (
                  <div style={{ padding: '2px 8px', fontWeight: 700 }}>
                    Unhealthy <Badge count={unhealthyCount} style={{ backgroundColor: '#f43f5e', marginLeft: 4 }} />
                  </div>
                ),
                value: 'unhealthy',
              },
            ]}
          />

          {/* Search & Method & Project Filter Controls */}
          <Space wrap size={10}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Filter by route or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 230 }}
              allowClear
            />

            <Select
              value={method}
              onChange={setMethod}
              style={{ width: 130 }}
              options={[
                { label: 'All Methods', value: 'all' },
                ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map(m => ({ label: m, value: m })),
              ]}
            />

            <Select
              value={project}
              onChange={setProject}
              style={{ width: 190 }}
              placeholder="All Projects"
              options={[
                { label: 'All Projects', value: 'all' },
                ...projects.map(p => ({ label: p.name, value: p.id })),
              ]}
            />
          </Space>
        </div>
      </Card>

      {/* Table view */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            Fetching live endpoint measurements...
          </div>
        </div>
      ) : endpoints.length === 0 ? (
        <EmptyState
          title="No Endpoints Found"
          description={search ? 'No endpoints match your current filter criteria.' : 'There are no active endpoints monitored yet. Register your first route or import OpenAPI specs.'}
          action={
            <Button
              type="primary"
              className="btn-primary-gradient"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
            >
              {projects.length === 0 ? 'Create a Project First' : 'Add First Endpoint'}
            </Button>
          }
        />
      ) : (
        <Card className="card-modern" styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={endpoints}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: ['15', '25', '50', '100', '250', '500'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} total endpoints`,
              style: { padding: '12px 20px' },
            }}
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
        title={
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text)' }}>
            Register New Endpoint
          </div>
        }
        open={isCreateModalOpen}
        onOk={handleRegisterEndpoint}
        onCancel={() => { setIsCreateModalOpen(false); createForm.resetFields(); }}
        confirmLoading={isSubmittingCreate}
        okText="Register Endpoint"
        cancelText="Cancel"
        okButtonProps={{ className: 'btn-primary-gradient' }}
        destroyOnClose
        width={600}
        style={{ maxWidth: '95vw', top: 30 }}
      >
        <Form
          form={createForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="projectId"
            label="Target Microservice Project"
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
            rules={[{ required: true, message: 'Please enter a name for this endpoint' }]}
          >
            <Input placeholder="e.g. Fetch Order Summary" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item name="method" label="Method" style={{ width: 140 }} rules={[{ required: true }]}>
              <Select options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => ({ label: m, value: m }))} />
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
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, wordBreak: 'break-all', fontWeight: 500 }}>
                    <LinkOutlined style={{ marginRight: 4 }} />
                    Full URL: <strong style={{ color: 'var(--color-text)' }}>{buildFullUrl(activeCreateProject.baseUrl, enteredCreatePath || '/')}</strong>
                  </div>
                )
              }
            >
              <Input placeholder="/api/v1/orders/:id" />
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
              <Select options={[200, 201, 202, 204, 301, 302, 400, 401, 403, 404, 409, 422, 500].map(c => ({ label: `HTTP ${c}`, value: c }))} />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item
              name="latencyThresholdMs"
              label={
                <Tooltip title="Responses slower than this threshold degrade the Health Score even if HTTP 200 is returned.">
                  <span>Latency Threshold (ms) <InfoCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} /></span>
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

          <Divider style={{ margin: '16px 0 12px', fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>
            Request Payload & Custom Headers
          </Divider>

          {(selectedCreateMethod === 'POST' || selectedCreateMethod === 'PUT' || selectedCreateMethod === 'PATCH') && (
            <Form.Item
              name="body"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Request Body (JSON)</span>
                  <Space size={6}>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        createForm.setFieldValue('body', JSON.stringify({
                          name: 'Sample Item',
                          status: 'active',
                          timestamp: new Date().toISOString()
                        }, null, 2));
                      }}
                    >
                      Insert Sample JSON
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        const cur = createForm.getFieldValue('body');
                        if (cur) {
                          try {
                            createForm.setFieldValue('body', JSON.stringify(JSON.parse(cur), null, 2));
                          } catch {
                            message.error('Invalid JSON syntax');
                          }
                        }
                      }}
                    >
                      Format JSON
                    </Button>
                  </Space>
                </div>
              }
              rules={[
                {
                  validator: async (_, val) => {
                    if (!val || !val.trim()) return;
                    if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
                      try {
                        JSON.parse(val.trim());
                      } catch (err: any) {
                        throw new Error('Invalid JSON syntax: ' + err.message);
                      }
                    }
                  },
                },
              ]}
              extra={
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  JSON payload sent for {selectedCreateMethod} requests during automated and manual health checks.
                </span>
              }
            >
              <Input.TextArea
                rows={4}
                placeholder={`{\n  "name": "Apple iPhone 16",\n  "data": {\n    "price": 999\n  }\n}`}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="headersText"
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>Custom Request Headers (JSON)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={() => {
                    createForm.setFieldValue('headersText', JSON.stringify({
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    }, null, 2));
                  }}
                >
                  Default Headers
                </Button>
              </div>
            }
            rules={[
              {
                validator: async (_, val) => {
                  if (!val || !val.trim()) return;
                  try {
                    const parsed = JSON.parse(val.trim());
                    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                      throw new Error('Headers must be a valid JSON key-value object');
                    }
                  } catch (err: any) {
                    throw new Error(err.message || 'Invalid JSON syntax');
                  }
                },
              },
            ]}
            extra={
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Optional JSON key-value pairs (e.g. Authorization, Api-Key, custom headers).
              </span>
            }
          >
            <Input.TextArea
              rows={3}
              placeholder={`{\n  "Authorization": "Bearer token",\n  "x-api-key": "secret"\n}`}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Endpoint Modal */}
      <Modal
        title={
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text)' }}>
            Edit Endpoint Configuration
          </div>
        }
        open={isEditModalOpen}
        onOk={handleUpdateEndpoint}
        onCancel={() => { setIsEditModalOpen(false); setEditingEndpoint(null); editForm.resetFields(); }}
        confirmLoading={isSubmittingEdit}
        okText="Update Endpoint"
        cancelText="Cancel"
        okButtonProps={{ className: 'btn-primary-gradient' }}
        destroyOnClose
        width={600}
        style={{ maxWidth: '95vw', top: 30 }}
      >
        <Form
          form={editForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Endpoint Friendly Name"
            rules={[{ required: true, message: 'Please enter a name for this endpoint' }]}
          >
            <Input placeholder="e.g. Fetch Order Summary" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="start">
            <Form.Item name="method" label="Method" style={{ width: 140 }} rules={[{ required: true }]}>
              <Select options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => ({ label: m, value: m }))} />
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
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, wordBreak: 'break-all', fontWeight: 500 }}>
                    <LinkOutlined style={{ marginRight: 4 }} />
                    Full URL: <strong style={{ color: 'var(--color-text)' }}>{buildFullUrl(activeEditProject.baseUrl, enteredEditPath || editingEndpoint?.path || '/')}</strong>
                  </div>
                )
              }
            >
              <Input placeholder="/api/v1/orders/:id" />
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
              <Select options={[200, 201, 202, 204, 301, 302, 400, 401, 403, 404, 409, 422, 500].map(c => ({ label: `HTTP ${c}`, value: c }))} />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item
              name="latencyThresholdMs"
              label={
                <Tooltip title="Responses slower than this threshold degrade the Health Score even if HTTP 200 is returned.">
                  <span>Latency Threshold (ms) <InfoCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} /></span>
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

          <Divider style={{ margin: '16px 0 12px', fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>
            Request Payload & Custom Headers
          </Divider>

          {(selectedEditMethod === 'POST' || selectedEditMethod === 'PUT' || selectedEditMethod === 'PATCH') && (
            <Form.Item
              name="body"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Request Body (JSON)</span>
                  <Space size={6}>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        editForm.setFieldValue('body', JSON.stringify({
                          name: 'Sample Item',
                          status: 'active',
                          timestamp: new Date().toISOString()
                        }, null, 2));
                      }}
                    >
                      Insert Sample JSON
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        const cur = editForm.getFieldValue('body');
                        if (cur) {
                          try {
                            editForm.setFieldValue('body', JSON.stringify(JSON.parse(cur), null, 2));
                          } catch {
                            message.error('Invalid JSON syntax');
                          }
                        }
                      }}
                    >
                      Format JSON
                    </Button>
                  </Space>
                </div>
              }
              rules={[
                {
                  validator: async (_, val) => {
                    if (!val || !val.trim()) return;
                    if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
                      try {
                        JSON.parse(val.trim());
                      } catch (err: any) {
                        throw new Error('Invalid JSON syntax: ' + err.message);
                      }
                    }
                  },
                },
              ]}
              extra={
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  JSON payload sent for {selectedEditMethod} requests during automated and manual health checks.
                </span>
              }
            >
              <Input.TextArea
                rows={4}
                placeholder={`{\n  "name": "Apple iPhone 16",\n  "data": {\n    "price": 999\n  }\n}`}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="headersText"
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>Custom Request Headers (JSON)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={() => {
                    editForm.setFieldValue('headersText', JSON.stringify({
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    }, null, 2));
                  }}
                >
                  Default Headers
                </Button>
              </div>
            }
            rules={[
              {
                validator: async (_, val) => {
                  if (!val || !val.trim()) return;
                  try {
                    const parsed = JSON.parse(val.trim());
                    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                      throw new Error('Headers must be a valid JSON key-value object');
                    }
                  } catch (err: any) {
                    throw new Error(err.message || 'Invalid JSON syntax');
                  }
                },
              },
            ]}
            extra={
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Optional JSON key-value pairs (e.g. Authorization, Api-Key, custom headers).
              </span>
            }
          >
            <Input.TextArea
              rows={3}
              placeholder={`{\n  "Authorization": "Bearer token",\n  "x-api-key": "secret"\n}`}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: API Import & Integration Center */}
      <ApiImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadData}
      />

      {/* Modal: Gemini AI Root Cause & Fix Diagnosis */}
      <Modal
        open={isAiModalOpen}
        onCancel={() => { setIsAiModalOpen(false); setSelectedAiEndpoint(null); setAiInsight(null); }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-icon-badge">
              <RobotOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                AI Root Cause Analysis & Fix
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                Powered by Google Gemini • Live Telemetry Diagnosis
              </div>
            </div>
          </div>
        }
        width={720}
        style={{ maxWidth: '95vw', top: 30 }}
        footer={[
          <Button key="close" type="primary" className="btn-primary-gradient" onClick={() => setIsAiModalOpen(false)}>
            Done
          </Button>,
        ]}
      >
        {selectedAiEndpoint && (
          <div style={{ marginTop: 16 }}>
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 16px', background: 'var(--color-bg-tertiary)', borderRadius: 12, border: '1px solid var(--color-border)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag className={getMethodBadgeClass(selectedAiEndpoint.method)} style={{ margin: 0, fontWeight: 700 }}>
                  {selectedAiEndpoint.method}
                </Tag>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--color-text)', fontSize: 13 }}>
                  {selectedAiEndpoint.path}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag color={selectedAiEndpoint.status === 'healthy' ? 'success' : selectedAiEndpoint.status === 'degraded' ? 'warning' : 'error'} style={{ fontWeight: 700 }}>
                  {selectedAiEndpoint.status.toUpperCase()} ({selectedAiEndpoint.healthScore ?? 100}%)
                </Tag>
                {selectedAiEndpoint.lastStatusCode && (
                  <Tag color={selectedAiEndpoint.lastStatusCode >= 400 ? 'error' : 'success'} style={{ fontWeight: 700 }}>
                    HTTP {selectedAiEndpoint.lastStatusCode}
                  </Tag>
                )}
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  P50: {selectedAiEndpoint.responseTimeP50 || 0}ms
                </span>
              </div>
            </div>

            {isLoadingAi ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 14 }}>
                  Gemini is analyzing endpoint telemetry, status code patterns, and latency logs...
                </div>
              </div>
            ) : aiInsight ? (
              <div>
                {/* Title & Description */}
                <Card size="small" className="card-modern" style={{ marginBottom: 16, borderLeft: '4px solid var(--color-primary)' }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text)', marginBottom: 6 }}>
                    {aiInsight.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    {aiInsight.description}
                  </div>
                </Card>

                {/* Likely Causes */}
                {aiInsight.likelyCauses && aiInsight.likelyCauses.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      Likely Causes:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {aiInsight.likelyCauses.map((c, i) => (
                        <div key={i} style={{ background: 'var(--color-bg-tertiary)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{c.cause}</span>
                            <Tag color={c.confidence === 'high' ? 'error' : 'warning'} style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>
                              {c.confidence} Confidence
                            </Tag>
                          </div>
                          {c.evidence && <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>Evidence: {c.evidence}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Checks */}
                {aiInsight.suggestedChecks && aiInsight.suggestedChecks.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      Diagnostic Checks:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                      {aiInsight.suggestedChecks.map((chk, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{chk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Fix */}
                {aiInsight.suggestedFix && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                        {aiInsight.suggestedFix.summary}
                      </div>
                    )}
                    {aiInsight.suggestedFix.codeSnippet && (
                      <pre style={{
                        background: '#090d16',
                        color: '#f8fafc',
                        padding: 14,
                        borderRadius: 10,
                        fontSize: 12,
                        overflowX: 'auto',
                        fontFamily: 'JetBrains Mono, monospace',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
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
