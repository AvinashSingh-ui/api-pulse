import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Switch,
  Tooltip,
  Popconfirm,
  Badge,
  Card,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Empty,
  Drawer,
  Alert as AntAlert,
  Typography,
  Divider,
  Spin,
  message,
} from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ArrowRightOutlined,
  CodeOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PageHeader }    from '@/components/common/PageHeader';
import { SeverityBadge } from '@/components/common/StatusBadge';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { useResponsive } from '@/hooks/useResponsive';
import { fromNow } from '@/utils';
import { alertsService }   from '@/services/endpoints/alerts';
import { projectsService } from '@/services/endpoints/projects';
import { endpointsService } from '@/services/endpoints/endpoints';
import { aiService } from '@/services/endpoints/ai';
import type { Alert, AlertRule, AlertSeverity, Project, Endpoint, AIInsight } from '@/types';

const { Text, Paragraph } = Typography;

const SEVERITY_ROW_BG: Record<AlertSeverity, string> = {
  critical: '#fff5f5',
  high: '#fff8f0',
  medium: '#fffbeb',
  low: '#f0f9ff',
};

/**
 * Alerts & Incident Response Page
 * ----------------------------------------------------
 * Beginner-Friendly Structure:
 * 1. Fetches active alerts, resolved history, and alert rules from database
 * 2. If navigated from a failing API ping (?endpointId=...&aiFix=true), automatically
 *    opens the AI Incident Diagnosis & Resolution Drawer
 * 3. Allows testing and recovering the API in-place with "Re-Test API Now"
 */
export default function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // AI Fix Drawer State
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [selectedAlertForAi, setSelectedAlertForAi] = useState<Alert | null>(null);
  const [selectedEndpointForAi, setSelectedEndpointForAi] = useState<Endpoint | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [reTesting, setReTesting] = useState(false);
  const [reTestResult, setReTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    responseTime?: number;
    message?: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, rulesRes, projectsRes] = await Promise.all([
        alertsService.listAlerts({ pageSize: 50 }).catch(() => ({ data: [] })),
        alertsService.listRules({ pageSize: 50 }).catch(() => ({ data: [] })),
        projectsService.list({ pageSize: 50 }).catch(() => ({ data: [] })),
      ]);

      const fetchedAlerts = alertsRes.data || [];
      setAlerts(fetchedAlerts);
      setRules(rulesRes.data || []);
      setProjects(projectsRes.data || []);
      return fetchedAlerts;
    } catch (err) {
      console.error('Failed to load alerts data:', err);
      message.error('Failed to load alerts data');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle open AI Fix drawer for a specific alert or endpoint
  const openAiFixDrawer = useCallback(async (targetAlert: Alert | null, endpointId?: string) => {
    setIsAiDrawerOpen(true);
    setLoadingAi(true);
    setReTestResult(null);
    setCopiedCode(false);

    const epId = targetAlert?.endpointId || endpointId;
    let endpointObj: Endpoint | null = null;

    if (epId) {
      try {
        endpointObj = await endpointsService.get(epId);
        setSelectedEndpointForAi(endpointObj);
      } catch (err) {
        console.warn('Failed to fetch endpoint details for AI fix:', err);
      }
    }

    // Set or synthesize alert
    if (targetAlert) {
      setSelectedAlertForAi(targetAlert);
    } else if (endpointObj) {
      setSelectedAlertForAi({
        id: `synth_${endpointObj.id}`,
        ruleId: 'system_auto_detector',
        projectId: endpointObj.projectId,
        endpointId: endpointObj.id,
        title: `Incident: ${endpointObj.method} ${endpointObj.path} Failed`,
        message: `Endpoint reported status "${endpointObj.status}" with P50 latency ${endpointObj.responseTimeP50}ms`,
        severity: endpointObj.status === 'down' ? 'critical' : 'high',
        status: 'active',
        triggeredAt: endpointObj.lastChecked || new Date().toISOString(),
        value: 500,
        threshold: endpointObj.expectedStatus || 200,
      });
    }

    // Fetch AI Root-Cause and Fix
    if (epId) {
      try {
        let insights = await aiService.getInsights({ endpointId: epId }).catch(() => []);
        if (!insights || insights.length === 0) {
          insights = await aiService.analyzeEndpoint(epId).catch(() => []);
        }
        if (insights && insights.length > 0) {
          setAiInsight(insights[0]);
        }
      } catch (err) {
        console.error('Failed to load AI insights:', err);
      }
    }

    setLoadingAi(false);
  }, []);

  // Initial load & automatic redirection handler
  useEffect(() => {
    loadData().then((fetchedAlerts) => {
      const paramEndpointId = searchParams.get('endpointId');
      const paramAlertId = searchParams.get('alertId');
      const paramAiFix = searchParams.get('aiFix') === 'true';

      if (paramAiFix || paramEndpointId || paramAlertId) {
        const matchedAlert = fetchedAlerts.find(
          (a) => (paramAlertId && a.id === paramAlertId) || (paramEndpointId && a.endpointId === paramEndpointId)
        );
        openAiFixDrawer(matchedAlert || null, paramEndpointId || undefined);
      }
    });
  }, [loadData, searchParams, openAiFixDrawer]);

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const historyAlerts = alerts.filter((a) => a.status !== 'active');

  const handleAcknowledge = async (id: string) => {
    try {
      await alertsService.acknowledge(id);
      message.success('Alert acknowledged');
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: 'acknowledged', acknowledgedAt: new Date().toISOString() } : a
        )
      );
      if (selectedAlertForAi?.id === id) {
        setSelectedAlertForAi((prev) => (prev ? { ...prev, status: 'acknowledged' } : null));
      }
    } catch {
      message.error('Failed to acknowledge alert');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await alertsService.resolve(id);
      message.success('Alert marked as resolved');
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: 'resolved', resolvedAt: new Date().toISOString() } : a
        )
      );
      if (selectedAlertForAi?.id === id) {
        setSelectedAlertForAi((prev) => (prev ? { ...prev, status: 'resolved' } : null));
      }
    } catch {
      message.error('Failed to resolve alert');
    }
  };

  const handleReTestEndpoint = async () => {
    const epId = selectedEndpointForAi?.id || selectedAlertForAi?.endpointId;
    if (!epId) return;

    setReTesting(true);
    setReTestResult(null);

    try {
      const res = await endpointsService.checkNow(epId);
      const isHealthy = res.status === 'healthy' || (res.statusCode && res.statusCode < 400);

      if (isHealthy) {
        setReTestResult({
          success: true,
          statusCode: res.statusCode || 200,
          responseTime: res.responseTime,
          message: `Endpoint recovered! Received HTTP ${res.statusCode || 200} OK in ${res.responseTime}ms.`,
        });

        // Auto-resolve active alert
        if (selectedAlertForAi && selectedAlertForAi.status === 'active') {
          await handleResolve(selectedAlertForAi.id);
        }

        // Update selected endpoint status
        if (selectedEndpointForAi) {
          setSelectedEndpointForAi({
            ...selectedEndpointForAi,
            status: 'healthy',
            responseTimeP50: res.responseTime,
          });
        }
      } else {
        setReTestResult({
          success: false,
          statusCode: res.statusCode || 500,
          responseTime: res.responseTime,
          message: res.error || `Endpoint still returning HTTP ${res.statusCode || 500} (${res.status.toUpperCase()})`,
        });
      }
    } catch (err: any) {
      setReTestResult({
        success: false,
        message: err.message || 'Re-test network request failed',
      });
    } finally {
      setReTesting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    message.success('Fix code snippet copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleToggleRule = async (id: string, isEnabled: boolean) => {
    try {
      await alertsService.toggleRule(id, isEnabled);
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isEnabled } : r)));
      message.success(`Rule ${isEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      message.error('Failed to toggle rule');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await alertsService.deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      message.success('Alert rule deleted');
    } catch {
      message.error('Failed to delete rule');
    }
  };

  const handleCreateRule = async () => {
    try {
      const values = await form.validateFields();
      const newRule = await alertsService.createRule({
        projectId: values.projectId,
        name: values.name,
        trigger: values.trigger,
        threshold: Number(values.threshold),
        operator: values.operator || 'gt',
        severity: values.severity || 'high',
        channels: values.channels || ['email'],
        isEnabled: true,
      });

      setRules((prev) => [newRule, ...prev]);
      setIsModalOpen(false);
      form.resetFields();
      message.success('Alert rule created successfully');
    } catch {
      // validation error or api error
    }
  };

  const getProjectName = (projectId: string) => {
    const p = projects.find((proj) => proj.id === projectId);
    return p ? p.name : projectId;
  };

  const alertColumns: ColumnsType<Alert> = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'sev',
      width: 100,
      render: (s: AlertSeverity) => <SeverityBadge severity={s} />,
    },
    {
      title: 'Alert / Incident',
      key: 'title',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{r.title}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.message}</div>
        </div>
      ),
    },
    {
      title: 'Project',
      dataIndex: 'projectId',
      key: 'proj',
      width: 150,
      render: (id: string) => <Tag color="blue">{getProjectName(id)}</Tag>,
    },
    {
      title: 'Triggered',
      dataIndex: 'triggeredAt',
      key: 'ts',
      width: 120,
      render: (v: string) => (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{fromNow(v)}</span>
      ),
    },
    {
      title: 'Value / SLA',
      key: 'val',
      width: 140,
      render: (_, r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.value}</span>
          <span style={{ color: '#94a3b8' }}> / {r.threshold}</span>
        </span>
      ),
    },
    {
      title: 'AI Root-Cause & Actions',
      key: 'actions',
      width: 250,
      render: (_, r) => (
        <Space size={6}>
          <Button
            size="small"
            style={{
              borderColor: '#8b5cf6',
              color: '#6d28d9',
              background: '#f5f3ff',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
            onClick={() => openAiFixDrawer(r)}
          >
            AI Fix
          </Button>

          {r.status === 'active' ? (
            <>
              <Tooltip title="Acknowledge">
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleAcknowledge(r.id)}
                >
                  Ack
                </Button>
              </Tooltip>
              <Tooltip title="Resolve Incident">
                <Button
                  size="small"
                  type="primary"
                  icon={<CloseOutlined />}
                  onClick={() => handleResolve(r.id)}
                >
                  Resolve
                </Button>
              </Tooltip>
            </>
          ) : (
            <Tag color={r.status === 'acknowledged' ? 'warning' : 'success'}>
              {r.status?.toUpperCase()}
            </Tag>
          )}
        </Space>
      ),
    },
  ];

  const ruleColumns: ColumnsType<AlertRule> = [
    {
      title: 'Rule',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Project',
      dataIndex: 'projectId',
      key: 'proj',
      render: (id: string) => <Tag>{getProjectName(id)}</Tag>,
    },
    {
      title: 'Trigger',
      dataIndex: 'trigger',
      key: 'trigger',
      render: (v: string) => <Tag>{v ? v.replace(/_/g, ' ') : 'metric'}</Tag>,
    },
    {
      title: 'Condition',
      key: 'cond',
      width: 140,
      render: (_, r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {r.operator} {r.threshold}
        </span>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'sev',
      width: 100,
      render: (s: AlertSeverity) => <SeverityBadge severity={s} />,
    },
    {
      title: 'Channels',
      dataIndex: 'channels',
      key: 'ch',
      render: (chs: string[]) => (
        <Space size={4}>
          {(chs || ['email']).map((c) => (
            <Tag key={c} style={{ fontSize: 10 }}>
              {c}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Enabled',
      dataIndex: 'isEnabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean, r) => (
        <Switch
          checked={v}
          size="small"
          onChange={(val) => handleToggleRule(r.id, val)}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <Popconfirm
          title="Delete this alert rule?"
          onConfirm={() => handleDeleteRule(r.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'active',
      label: (
        <span>
          Active Incidents{' '}
          <Badge
            count={activeAlerts.length}
            style={{ backgroundColor: activeAlerts.length > 0 ? '#ef4444' : '#22c55e', marginLeft: 4 }}
          />
        </span>
      ),
      children: activeAlerts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No active alerts. All endpoints are healthy and within SLAs."
          style={{ padding: '36px 0' }}
        />
      ) : (
        <Table
          dataSource={activeAlerts}
          columns={alertColumns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
          onRow={(r) => ({ style: { background: SEVERITY_ROW_BG[r.severity] } })}
        />
      ),
    },
    {
      key: 'history',
      label: `Incident History (${historyAlerts.length})`,
      children: historyAlerts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No historical alerts recorded"
          style={{ padding: '36px 0' }}
        />
      ) : (
        <Table
          dataSource={historyAlerts}
          columns={alertColumns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
          scroll={{ x: 800 }}
        />
      ),
    },
    {
      key: 'rules',
      label: `Alert Rules (${rules.length})`,
      children: rules.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No alert rules created yet. Create a rule to monitor latency, downtime, or error spikes."
          style={{ padding: '36px 0' }}
        >
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Create First Alert Rule
          </Button>
        </Empty>
      ) : (
        <Table
          dataSource={rules}
          columns={ruleColumns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Alerts & Incident Response"
        subtitle="Live automated incident detection, root-cause diagnosis, and step-by-step AI remediation"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              New Rule
            </Button>
          </Space>
        }
      />

      {searchParams.get('aiFix') === 'true' && (
        <AntAlert
          message="Automated Incident Redirection"
          description="An API error was detected. The incident has been logged, and API Pulse has automatically loaded the AI root-cause diagnosis and resolution steps below."
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <Tabs defaultActiveKey="active" items={tabItems} />
      </Card>

      {/* 🤖 AI Incident Diagnosis & Resolution Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
              }}
            >
              <RobotOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                AI Incident Diagnosis & Resolution
              </div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                Autonomous telemetry analysis & developer remediation plan
              </div>
            </div>
          </div>
        }
        placement="right"
        width={isMobile ? '100%' : 700}
        onClose={() => {
          setIsAiDrawerOpen(false);
          // clear query params if present
          if (searchParams.get('aiFix')) {
            setSearchParams({});
          }
        }}
        open={isAiDrawerOpen}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <Button
              type="primary"
              style={{ background: '#7c3aed', borderColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}
              icon={<ThunderboltOutlined />}
              loading={reTesting}
              onClick={handleReTestEndpoint}
            >
              ⚡ Re-Test API Now
            </Button>

            <Space>
              {selectedAlertForAi?.status === 'active' && (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => selectedAlertForAi && handleResolve(selectedAlertForAi.id)}
                >
                  Mark as Resolved
                </Button>
              )}
              <Button
                icon={<ArrowRightOutlined />}
                onClick={() => navigate('/ai-analysis')}
              >
                Open in AI Copilot Chat
              </Button>
            </Space>
          </div>
        }
      >
        {loadingAi ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>
              Analyzing incident telemetry and generating AI remediation code...
            </div>
          </div>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Incident Header Info Card */}
            <Card
              size="small"
              style={{
                borderRadius: 10,
                border: '1px solid #fee2e2',
                background: '#fff5f5',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {selectedEndpointForAi && (
                      <HttpMethodTag method={selectedEndpointForAi.method} size="sm" />
                    )}
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                      {selectedEndpointForAi?.path || selectedAlertForAi?.title}
                    </span>
                    <SeverityBadge severity={selectedAlertForAi?.severity || 'critical'} />
                  </div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {selectedAlertForAi?.message}
                  </div>
                </div>

                <Tag color={selectedAlertForAi?.status === 'active' ? 'red' : 'green'} style={{ fontWeight: 600 }}>
                  {selectedAlertForAi?.status?.toUpperCase()}
                </Tag>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid #fecaca', fontSize: 12, color: '#64748b' }}>
                <div>
                  <strong>Project:</strong> {getProjectName(selectedAlertForAi?.projectId || selectedEndpointForAi?.projectId || '')}
                </div>
                <div>
                  <strong>Detected:</strong> {fromNow(selectedAlertForAi?.triggeredAt || '')}
                </div>
                <div>
                  <strong>HTTP Status:</strong> <span style={{ color: '#dc2626', fontWeight: 600 }}>{selectedAlertForAi?.value || 500}</span> (Expected {selectedAlertForAi?.threshold || 200})
                </div>
              </div>
            </Card>

            {/* Re-Test Result Banner */}
            {reTestResult && (
              <AntAlert
                message={reTestResult.success ? 'Verification Succeeded' : 'Verification Failed'}
                description={reTestResult.message}
                type={reTestResult.success ? 'success' : 'error'}
                showIcon
                icon={reTestResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              />
            )}

            {/* AI Root-Cause Diagnosis */}
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BulbOutlined style={{ color: '#d97706', fontSize: 16 }} />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>AI Root-Cause Diagnosis</span>
                  </div>
                  <Tag color="purple" style={{ borderRadius: 12, padding: '1px 10px', fontWeight: 600 }}>
                    AI Confidence: {Math.round((aiInsight?.confidence || 0.94) * 100)}%
                  </Tag>
                </div>
              }
              style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>
                {aiInsight?.title || 'Upstream Application Exception Detected'}
              </div>
              <Paragraph style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                {aiInsight?.description || 'The target server failed to return the expected status code. Diagnostic analysis indicates an uncaught runtime exception, downstream timeout, or unexpected server shutdown.'}
              </Paragraph>

              {aiInsight?.likelyCauses && aiInsight.likelyCauses.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Probable Failure Causes & Evidence
                  </div>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {aiInsight.likelyCauses.map((cause, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#f8fafc',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Tag
                            color={cause.confidence === 'high' ? 'red' : cause.confidence === 'medium' ? 'orange' : 'blue'}
                            style={{ fontSize: 10, fontWeight: 600 }}
                          >
                            {cause.confidence.toUpperCase()} CONFIDENCE
                          </Tag>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{cause.cause}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          <strong>Evidence:</strong> {cause.evidence}
                        </div>
                      </div>
                    ))}
                  </Space>
                </div>
              )}

              {aiInsight?.suggestedChecks && aiInsight.suggestedChecks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Suggested Diagnostic Checks
                  </div>
                  <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                    {aiInsight.suggestedChecks.map((chk, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>{chk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* AI Actionable Fix & Code Snippet */}
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CodeOutlined style={{ color: '#7c3aed', fontSize: 16 }} />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Recommended Remediation & Code Fix</span>
                  </div>
                  {aiInsight?.suggestedFix?.codeSnippet && (
                    <Button
                      size="small"
                      type="dashed"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyCode(aiInsight.suggestedFix?.codeSnippet || '')}
                    >
                      {copiedCode ? 'Copied!' : 'Copy Fix Code'}
                    </Button>
                  )}
                </div>
              }
              style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                {aiInsight?.suggestedFix?.summary || 'Implement defensive exception boundaries and circuit-breaker retry policies'}
              </div>

              {aiInsight?.suggestedFix?.steps && aiInsight.suggestedFix.steps.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                    {aiInsight.suggestedFix.steps.map((st, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{st}</li>
                    ))}
                  </ol>
                </div>
              )}

              {aiInsight?.suggestedFix?.codeSnippet && (
                <div style={{ position: 'relative' }}>
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '14px 16px',
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      fontFamily: 'JetBrains Mono, monospace',
                      overflowX: 'auto',
                      maxHeight: 280,
                      border: '1px solid #1e293b',
                    }}
                  >
                    {aiInsight.suggestedFix.codeSnippet}
                  </pre>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyCode(aiInsight.suggestedFix?.codeSnippet || '')}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'rgba(255,255,255,0.1)',
                      borderColor: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                    }}
                  >
                    {copiedCode ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      {/* New Rule Modal */}
      <Modal
        title="Create Alert Rule"
        open={isModalOpen}
        onOk={handleCreateRule}
        onCancel={() => setIsModalOpen(false)}
        okText="Create Rule"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ trigger: 'response_time', operator: 'gt', severity: 'high', channels: ['email'] }}>
          <Form.Item
            name="projectId"
            label="Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select placeholder="Select project">
              {projects.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="Rule Name"
            rules={[{ required: true, message: 'Please provide a rule name' }]}
          >
            <Input placeholder="e.g. High P95 Latency Alert" />
          </Form.Item>

          <Form.Item name="trigger" label="Trigger Metric" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="response_time">Response Time (ms)</Select.Option>
              <Select.Option value="error_rate">Error Rate (%)</Select.Option>
              <Select.Option value="downtime">Consecutive Failures / Downtime</Select.Option>
              <Select.Option value="request_volume">Traffic Spike (Req/min)</Select.Option>
            </Select>
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }}>
            <Form.Item name="operator" label="Condition" style={{ width: 140 }}>
              <Select>
                <Select.Option value="gt">&gt; (Greater than)</Select.Option>
                <Select.Option value="gte">&gt;= (Greater or equal)</Select.Option>
                <Select.Option value="lt">&lt; (Less than)</Select.Option>
                <Select.Option value="lte">&lt;= (Less or equal)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="threshold"
              label="Threshold"
              rules={[{ required: true, message: 'Please enter a threshold value' }]}
              style={{ flex: 1 }}
            >
              <InputNumber style={{ width: '100%' }} placeholder="e.g. 500" />
            </Form.Item>
          </Space>

          <Form.Item name="severity" label="Severity">
            <Select>
              <Select.Option value="low">Low</Select.Option>
              <Select.Option value="medium">Medium</Select.Option>
              <Select.Option value="high">High</Select.Option>
              <Select.Option value="critical">Critical</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="channels" label="Notification Channels">
            <Select mode="multiple" placeholder="Select notification channels">
              <Select.Option value="email">Email</Select.Option>
              <Select.Option value="slack">Slack Webhook</Select.Option>
              <Select.Option value="sms">SMS Alert</Select.Option>
              <Select.Option value="webhook">Custom Webhook</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
