import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  List,
  Tag,
  Space,
  Input,
  Select,
  Tabs,
  Spin,
  Typography,
  Modal,
  Form,
  InputNumber,
  Empty,
  Tooltip,
  Checkbox,
  Table,
  Badge,
  Popconfirm,
  Divider,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  SendOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  CheckOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  FileTextOutlined,
  ClearOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/common/PageHeader';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';
import { useAppDispatch } from '@/app/hooks';
import { apiSlice } from '@/services/apiSlice';
import { testingService } from '@/services/endpoints/testing';
import { endpointsService } from '@/services/endpoints/endpoints';
import { projectsService } from '@/services/endpoints/projects';
import type { TestCase, TestStatus, Endpoint, Project, HttpMethod, TestAssertion, TestResult } from '@/types';

const HTTP_STATUS_PHRASES: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

const getFormattedStatus = (code: number, text?: string) => {
  const defaultPhrase = HTTP_STATUS_PHRASES[code] || '';
  if (!text) return defaultPhrase ? `${code} ${defaultPhrase}` : String(code);
  const clean = String(text).trim();
  // Prevent any duplicate numbers e.g. "400 400" or statusText === "400"
  if (clean === String(code) || clean === `${code} ${code}` || /^\d+$/.test(clean)) {
    return defaultPhrase ? `${code} ${defaultPhrase}` : String(code);
  }
  const stripped = clean.replace(new RegExp(`^${code}\\s*`, 'i'), '').trim();
  const phrase = stripped || defaultPhrase;
  return phrase ? `${code} ${phrase}` : String(code);
};

const { TextArea } = Input;
const { Text } = Typography;

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

const statusIcon = (s?: TestStatus) => {
  if (!s || s === 'pending') return <MinusCircleOutlined style={{ color: '#94a3b8' }} />;
  if (s === 'passed') return <CheckCircleOutlined style={{ color: '#22c55e' }} />;
  if (s === 'running') return <Spin size="small" />;
  return <CloseCircleOutlined style={{ color: '#ef4444' }} />;
};

const statusColor = (s?: TestStatus): string => {
  const m: Record<string, string> = {
    passed: 'success',
    failed: 'error',
    error: 'error',
    running: 'processing',
    pending: 'default',
  };
  return m[s ?? 'pending'] ?? 'default';
};

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export default function TestingPage() {
  const dispatch = useAppDispatch();
  const { isTablet } = useResponsive();
  const { isDark } = useTheme();

  // Test cases & endpoints state
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Active Request Builder State (Postman style)
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState<string>('');
  const [testName, setTestName] = useState<string>('Custom API Verification');
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | undefined>(undefined);

  // Request Sub-Tabs: Params, Headers, Body, Assertions
  const [params, setParams] = useState<KeyValueRow[]>([]);
  const [headers, setHeaders] = useState<KeyValueRow[]>([
    { id: 'h_1', key: 'Accept', value: 'application/json', enabled: true },
    { id: 'h_2', key: 'Content-Type', value: 'application/json', enabled: true },
  ]);
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'raw'>('none');
  const [bodyContent, setBodyContent] = useState<string>('');
  const [assertions, setAssertions] = useState<TestAssertion[]>([
    { id: 'a_1', type: 'status_code', expected: 200, operator: 'eq' },
    { id: 'a_2', type: 'response_time', expected: 1000, operator: 'lt' },
  ]);

  // Active Response State
  const [activeResponse, setActiveResponse] = useState<TestResult | null>(null);
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'assertions' | 'info'>('body');

  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveForm] = Form.useForm();

  // Load all initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [casesRes, epRes, projRes] = await Promise.all([
        testingService.listTestCases().catch(() => ({ data: [] })),
        endpointsService.list({ pageSize: 1000 }).catch(() => ({ data: [] })),
        projectsService.list({ pageSize: 100 }).catch(() => ({ data: [] })),
      ]);

      const cases = casesRes.data || [];
      const eps = epRes.data || [];
      const projs = projRes.data || [];

      setTestCases(cases);
      setEndpoints(eps);
      setProjects(projs);

      if (cases.length > 0 && !selectedCaseId) {
        loadTestCaseIntoRunner(cases[0]);
      }
    } catch (err) {
      console.error('Failed to load testing data:', err);
      message.error('Failed to load test cases');
    } finally {
      setLoading(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load a test case into the interactive runner
  const loadTestCaseIntoRunner = (tc: TestCase) => {
    setSelectedCaseId(tc.id);
    setTestName(tc.name);
    setMethod(tc.method);
    setSelectedEndpointId(tc.endpointId);

    // Parse URL & Query params
    const rawUrl = tc.url || '';
    setUrl(rawUrl);
    try {
      const parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `http://localhost${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`);
      const newParams: KeyValueRow[] = [];
      parsedUrl.searchParams.forEach((value, key) => {
        newParams.push({ id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, key, value, enabled: true });
      });
      if (newParams.length > 0) setParams(newParams);
    } catch {}

    // Load headers
    const newHeaders: KeyValueRow[] = Object.entries(tc.headers || {}).map(([key, value], idx) => ({
      id: `h_${idx}_${Date.now()}`,
      key,
      value: String(value),
      enabled: true,
    }));
    if (newHeaders.length === 0) {
      newHeaders.push({ id: 'h_1', key: 'Accept', value: 'application/json', enabled: true });
    }
    setHeaders(newHeaders);

    // Load body
    if (tc.body) {
      setBodyType('json');
      setBodyContent(typeof tc.body === 'string' ? tc.body : JSON.stringify(tc.body, null, 2));
    } else {
      setBodyType('none');
      setBodyContent('');
    }

    // Load assertions
    setAssertions(tc.assertions || [
      { id: 'a_1', type: 'status_code', expected: 200, operator: 'eq' },
    ]);

    setActiveResponse(null);
  };

  // Switch to clean Ad-Hoc / Custom Playground
  const handleStartAdHoc = () => {
    setSelectedCaseId(null);
    setTestName('New Custom API Request');
    setMethod('GET');
    setUrl('');
    setSelectedEndpointId(undefined);
    setParams([]);
    setHeaders([
      { id: 'h_1', key: 'Accept', value: 'application/json', enabled: true },
      { id: 'h_2', key: 'Content-Type', value: 'application/json', enabled: true },
    ]);
    setBodyType('none');
    setBodyContent('');
    setAssertions([
      { id: 'a_1', type: 'status_code', expected: 200, operator: 'eq' },
      { id: 'a_2', type: 'response_time', expected: 1000, operator: 'lt' },
    ]);
    setActiveResponse(null);
  };

  // Pre-fill from an existing Endpoint
  const handleSelectEndpoint = (epId: string) => {
    const ep = endpoints.find(e => e.id === epId);
    if (!ep) return;
    const proj = projects.find(p => p.id === ep.projectId);
    let rawUrl = proj?.baseUrl ? `${proj.baseUrl.replace(/\/+$/, '')}/${ep.path.replace(/^\/+/, '')}` : ep.path;

    // Resolve template path parameters in URL e.g. /users/{id} -> /users/1
    rawUrl = rawUrl.replace(/\{([a-zA-Z0-9_-]+)\}|:([a-zA-Z0-9_-]+)/g, (_match, p1, p2) => {
      const key = p1 || p2;
      if (ep.pathParams && ep.pathParams[key] !== undefined) {
        return encodeURIComponent(ep.pathParams[key]);
      }
      const lower = (key || '').toLowerCase();
      if (lower.includes('country') || lower.includes('countries')) return 'US';
      if (lower.includes('provideraccount')) return 'acc_1';
      if (lower.includes('provider')) return 'custom';
      if (lower.includes('entity') || lower.includes('type')) return 'customer';
      if (lower.includes('account') || lower.includes('contact') || lower.includes('lead') || lower.includes('process')) return '1';
      if (lower.includes('uuid') || lower.includes('id')) return '00000000-0000-0000-0000-000000000001';
      if (lower.includes('num') || lower.includes('count') || lower.includes('page') || lower.includes('limit')) return '1';
      if (lower.includes('token') || lower.includes('jwt') || lower.includes('hash')) return 'test_token';
      if (lower.includes('name') || lower.includes('slug') || lower.includes('item')) return 'sample_item';
      if (lower.includes('email')) return 'test%40example.com';
      if (lower.includes('date')) return '2026-01-01';
      return '1';
    });

    setSelectedEndpointId(ep.id);
    setMethod(ep.method);
    setUrl(rawUrl);
    setTestName(`Verify ${ep.method} ${ep.path}`);

    // Load body for POST, PUT, PATCH, DELETE
    const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    if (ep.body && ep.body.trim()) {
      setBodyContent(ep.body.trim());
      setBodyType('json');
    } else if (isBodyMethod) {
      setBodyContent('{\n  "status": "active"\n}');
      setBodyType('json');
    } else {
      setBodyContent('');
      setBodyType('none');
    }

    // Load headers
    const newHeaders: KeyValueRow[] = [
      { id: 'h_1', key: 'Accept', value: 'application/json', enabled: true },
    ];
    if (isBodyMethod || ep.body) {
      newHeaders.push({ id: 'h_2', key: 'Content-Type', value: ep.contentType || 'application/json', enabled: true });
    }
    if (ep.headers) {
      Object.entries(ep.headers).forEach(([k, v], idx) => {
        if (k.toLowerCase() !== 'accept' && k.toLowerCase() !== 'content-type' && !String(v).includes('<YOUR_TOKEN>')) {
          newHeaders.push({ id: `h_ep_${idx}`, key: k, value: String(v), enabled: true });
        }
      });
    }

    // Auto-inject project headers (e.g. x-product-id)
    if (proj?.headers) {
      let pH: Record<string, string> = {};
      if (typeof proj.headers === 'string') {
        try { pH = JSON.parse(proj.headers); } catch {}
      } else if (typeof proj.headers === 'object') {
        pH = proj.headers;
      }
      Object.entries(pH).forEach(([k, v], idx) => {
        if (!newHeaders.some(h => h.key.toLowerCase() === k.toLowerCase())) {
          newHeaders.push({ id: `h_proj_${idx}`, key: k, value: String(v), enabled: true });
        }
      });
    }

    if ((rawUrl.includes('notification-service') || ep.path.includes('notification-service')) && !newHeaders.some(h => h.key.toLowerCase() === 'x-product-id')) {
      newHeaders.push({ id: 'h_prod_id', key: 'x-product-id', value: '00000000-0000-0000-0000-000000000001', enabled: true });
    }
    setHeaders(newHeaders);

    // Load query params
    if (ep.queryParams && Object.keys(ep.queryParams).length > 0) {
      setParams(Object.entries(ep.queryParams).map(([k, v], idx) => ({
        id: `p_${idx}`,
        key: k,
        value: String(v),
        enabled: true,
      })));
    } else {
      setParams([]);
    }

    // Load smart assertion
    const expected = ep.expectedStatus || (ep.method === 'POST' ? 201 : ep.method === 'DELETE' ? 204 : 200);
    setAssertions([
      { id: `a_${Date.now()}`, type: 'status_code', expected, operator: 'eq' },
      { id: `a_${Date.now() + 1}`, type: 'response_time', expected: Math.max(ep.responseTimeP95 * 2 || 1000, 500), operator: 'lt' },
    ]);
    message.info(`Loaded endpoint "${ep.name}" configuration with sample parameters`);
  };

  // Convert headers list to record
  const compiledHeaders = useMemo(() => {
    const map: Record<string, string> = {};
    headers.filter(h => h.enabled && h.key.trim()).forEach(h => {
      map[h.key.trim()] = h.value;
    });
    return map;
  }, [headers]);

  // Convert params list to query string URL
  const compiledUrl = useMemo(() => {
    const activeParams = params.filter(p => p.enabled && p.key.trim());
    if (activeParams.length === 0) return url;

    try {
      const isHttp = url.startsWith('http://') || url.startsWith('https://');
      const dummyBase = 'http://localhost';
      const parsed = new URL(isHttp ? url : `${dummyBase}${url.startsWith('/') ? '' : '/'}${url}`);
      
      activeParams.forEach(p => {
        parsed.searchParams.set(p.key.trim(), p.value);
      });

      if (isHttp) return parsed.toString();
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }, [url, params]);

  // Execute request (Postman / Playwright runner)
  const handleExecuteRequest = async () => {
    if (!url || !url.trim()) {
      message.error('Please enter a target URL');
      return;
    }

    setRunning(true);
    setActiveResponse(null);

    try {
      let finalBody: string | undefined = undefined;
      if (bodyType !== 'none' && bodyContent.trim()) {
        finalBody = bodyContent.trim();
      }

      const res: TestResult = await testingService.runCustom({
        method,
        url: compiledUrl,
        headers: compiledHeaders,
        body: finalBody,
        assertions,
      });

      setActiveResponse(res);
      setResponseTab(res.assertionResults && res.assertionResults.length > 0 ? 'assertions' : 'body');

      // If we are currently editing a saved test case, update its status in the list
      if (selectedCaseId) {
        setTestCases(prev => prev.map(tc => tc.id === selectedCaseId ? {
          ...tc,
          lastStatus: res.status,
          lastRunAt: new Date().toISOString(),
        } : tc));
      }

      if (res.status === 'passed') {
        message.success(`Request Succeeded: HTTP ${res.statusCode} (${res.responseTime}ms) - All assertions passed!`);
      } else if (res.status === 'failed') {
        message.warning(`Request Completed: HTTP ${res.statusCode} (${res.responseTime}ms) - Some assertions failed`);
      } else {
        message.error(`Request Failed: HTTP ${res.statusCode} - ${res.error || 'Server error'}`);
      }

      // Immediately refresh notifications so the top navbar bell reflects live test output
      dispatch(apiSlice.util.invalidateTags(['Notifications', 'Alerts']));
    } catch (err: any) {
      console.error('Execution error:', err);
      message.error(err.message || 'Failed to send request');
      setActiveResponse({
        id: `err_${Date.now()}`,
        testCaseId: selectedCaseId || 'adhoc',
        status: 'error',
        statusCode: 500,
        statusText: 'Network / Client Error',
        responseTime: 0,
        sizeBytes: 0,
        responseBody: JSON.stringify({ error: err.message || 'Request failed' }, null, 2),
        responseHeaders: {},
        targetUrl: compiledUrl,
        assertionResults: [],
        runAt: new Date().toISOString(),
        error: err.message || 'Execution failed',
      });
      dispatch(apiSlice.util.invalidateTags(['Notifications', 'Alerts']));
    } finally {
      setRunning(false);
    }
  };

  // Run all saved test cases
  const handleRunAll = async () => {
    if (testCases.length === 0) {
      message.info('No saved test cases to run');
      return;
    }
    setRunningAll(true);
    try {
      const results = await testingService.runAll();
      message.success(`Completed execution of ${results.length} test cases!`);
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Failed to run all test cases');
    } finally {
      setRunningAll(false);
    }
  };

  // Save current request as Test Case
  const handleOpenSaveModal = () => {
    saveForm.setFieldsValue({
      name: testName || `Verify ${method} ${url}`,
      endpointId: selectedEndpointId,
    });
    setIsSaveModalOpen(true);
  };

  const handleSaveTestCase = async () => {
    try {
      const values = await saveForm.validateFields();
      let finalBody: string | undefined = undefined;
      if (bodyType !== 'none' && bodyContent.trim()) {
        finalBody = bodyContent.trim();
      }

      if (selectedCaseId && testCases.some(t => t.id === selectedCaseId)) {
        // Update existing test case
        const updated = await testingService.updateTestCase(selectedCaseId, {
          name: values.name,
          method,
          url: compiledUrl,
          headers: compiledHeaders,
          body: finalBody,
          assertions,
          endpointId: values.endpointId || undefined,
        });
        setTestCases(prev => prev.map(t => t.id === selectedCaseId ? updated : t));
        setTestName(updated.name);
        message.success('Test case updated successfully');
      } else {
        // Create new test case
        const created = await testingService.createTestCase({
          name: values.name,
          method,
          url: compiledUrl,
          headers: compiledHeaders,
          body: finalBody,
          assertions,
          endpointId: values.endpointId || undefined,
        });
        setTestCases(prev => [created, ...prev]);
        setSelectedCaseId(created.id);
        setTestName(created.name);
        message.success('Saved as new test case');
      }
      setIsSaveModalOpen(false);
    } catch (err: any) {
      if (err.message) message.error(err.message);
    }
  };

  // Delete test case
  const handleDeleteCase = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await testingService.deleteTestCase(id);
      setTestCases(prev => prev.filter(t => t.id !== id));
      if (selectedCaseId === id) {
        handleStartAdHoc();
      }
      message.success('Test case removed');
    } catch (err: any) {
      message.error(err.message || 'Failed to delete test case');
    }
  };

  // Prettify JSON in body
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(bodyContent);
      setBodyContent(JSON.stringify(parsed, null, 2));
      message.success('JSON formatted');
    } catch {
      message.warning('Body does not contain valid JSON to format');
    }
  };

  // Add Assertion Snippet Templates
  const addAssertion = (type: TestAssertion['type'], operator: TestAssertion['operator'], expected: string | number) => {
    const newAssertion: TestAssertion = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      operator,
      expected,
    };
    setAssertions(prev => [...prev, newAssertion]);
    message.success(`Added assertion: ${type.replace(/_/g, ' ')} ${operator} ${expected}`);
  };

  // Filtered test cases
  const filteredCases = useMemo(() => {
    if (!searchFilter.trim()) return testCases;
    const term = searchFilter.toLowerCase();
    return testCases.filter(c => c.name.toLowerCase().includes(term) || c.url.toLowerCase().includes(term) || c.method.toLowerCase().includes(term));
  }, [testCases, searchFilter]);

  return (
    <div>
      <PageHeader
        title="API Testing & Verification"
        subtitle="Live HTTP Client, Postman-style Request Runner, and Automated Synthetic Assertion Verification"
        breadcrumbs={[{ label: 'Testing' }]}
        actions={
          <Space size={10}>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              Refresh
            </Button>
            <Button
              icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
              onClick={handleRunAll}
              loading={runningAll}
              disabled={testCases.length === 0}
              style={{ fontWeight: 600 }}
            >
              Run All Tests
            </Button>
            <Button
              type="primary"
              className="btn-primary-gradient"
              icon={<PlusOutlined />}
              onClick={handleStartAdHoc}
            >
              New Request
            </Button>
          </Space>
        }
      />

      <Row gutter={[20, 20]} style={{ minHeight: isTablet ? 'auto' : 'calc(100vh - 210px)' }}>
        {/* Left Column: Test Case Collections & Requests */}
        <Col xs={24} lg={7} xl={6}>
          <Card
            className="card-modern"
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>
                  Test Cases <Badge count={testCases.length} style={{ backgroundColor: 'var(--color-primary)', marginLeft: 6 }} />
                </span>
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={handleStartAdHoc}>
                  New
                </Button>
              </div>
            }
            style={{ height: '100%' }}
            styles={{ body: { padding: '14px 0 0 0' } }}
          >
            <div style={{ padding: '0 14px 14px 14px' }}>
              <Input
                placeholder="Search tests..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                allowClear
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                size="middle"
              />
            </div>

            {/* Quick Ad-Hoc / Custom Runner Card */}
            <div
              onClick={handleStartAdHoc}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                background: selectedCaseId === null ? 'var(--color-bg-tertiary)' : 'transparent',
                borderLeft: selectedCaseId === null ? '4px solid var(--color-primary)' : '4px solid transparent',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s ease',
              }}
            >
              <ThunderboltOutlined style={{ color: 'var(--color-text)', fontSize: 18 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                  Live API Playground
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Ad-hoc Postman request runner
                </div>
              </div>
            </div>

            <List
              dataSource={filteredCases}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No saved test cases"
                    style={{ margin: '32px 0' }}
                  />
                ),
              }}
              style={{ maxHeight: isTablet ? 360 : 'calc(100vh - 360px)', overflowY: 'auto' }}
              renderItem={(item) => {
                const isSelected = selectedCaseId === item.id;
                return (
                  <List.Item
                    onClick={() => loadTestCaseIntoRunner(item)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                      borderLeft: isSelected ? '4px solid var(--color-primary)' : '4px solid transparent',
                      transition: 'all 0.15s ease',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          {statusIcon(item.lastStatus)}
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: isSelected ? 700 : 600,
                              color: 'var(--color-text)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 150,
                            }}
                          >
                            {item.name}
                          </span>
                        </div>
                        <Space size={4}>
                          <Tag color={statusColor(item.lastStatus)} style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>
                            {(item.lastStatus ?? 'pending').toUpperCase()}
                          </Tag>
                          <Popconfirm
                            title="Delete this test case?"
                            onConfirm={(e) => handleDeleteCase(item.id, e)}
                            okText="Delete"
                            cancelText="Cancel"
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>
                        </Space>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HttpMethodTag method={item.method} size="sm" />
                        <span
                          style={{
                            fontSize: 11,
                            color: '#64748b',
                            fontFamily: 'JetBrains Mono, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.url}
                        </span>
                      </div>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>

        {/* Right Column: Live Request Builder & Response Console (Postman Style) */}
        <Col xs={24} lg={17} xl={18}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {/* Top Interactive Request Bar */}
            <Card className="card-modern" styles={{ body: { padding: '20px 24px' } }}>
              <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={8}>
                  <Text strong style={{ fontSize: 15, color: 'var(--color-text)' }}>
                    {selectedCaseId ? `Test Case: ${testName}` : 'Custom Request Playground'}
                  </Text>
                  {selectedCaseId ? (
                    <Tag style={{ fontWeight: 700, borderRadius: 6, background: 'var(--color-bg-tertiary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>Saved Test</Tag>
                  ) : (
                    <Tag style={{ fontWeight: 700, borderRadius: 6, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Ad-Hoc Request</Tag>
                  )}
                </Space>

                <Space size={10}>
                  {/* Select Endpoint Helper */}
                  <Select
                    placeholder="Load Endpoint URL..."
                    size="middle"
                    style={{ width: 230 }}
                    value={selectedEndpointId}
                    onChange={handleSelectEndpoint}
                    allowClear
                  >
                    {endpoints.map(ep => (
                      <Select.Option key={ep.id} value={ep.id}>
                        {ep.method} {ep.path}
                      </Select.Option>
                    ))}
                  </Select>

                  <Button icon={<SaveOutlined />} onClick={handleOpenSaveModal}>
                    {selectedCaseId ? 'Update Test' : 'Save As Test'}
                  </Button>
                </Space>
              </div>

              {/* Address bar with Method + URL + Send */}
              <div style={{ display: 'flex', gap: 10 }}>
                <Select
                  value={method}
                  onChange={(val) => {
                    setMethod(val);
                    if (['POST', 'PUT', 'PATCH'].includes(val) && (!bodyContent || bodyType === 'none')) {
                      setBodyType('json');
                      setBodyContent('{\n  "status": "active"\n}');
                    }
                  }}
                  style={{ width: 120, fontWeight: 800 }}
                  size="large"
                >
                  {HTTP_METHODS.map(m => (
                    <Select.Option key={m} value={m}>
                      <span style={{ fontWeight: 800 }}>{m}</span>
                    </Select.Option>
                  ))}
                </Select>

                <Input
                  size="large"
                  placeholder="https://api.example.com/v1/resource or /users/octocat"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onPressEnter={handleExecuteRequest}
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
                  allowClear
                />

                <Button
                  type="primary"
                  size="large"
                  icon={<SendOutlined />}
                  onClick={handleExecuteRequest}
                  loading={running}
                  className="btn-primary-gradient"
                  style={{ minWidth: 120 }}
                >
                  Send
                </Button>
              </div>

              {/* Request Configuration Tabs */}
              <Tabs
                defaultActiveKey="params"
                style={{ marginTop: 12 }}
                items={[
                  {
                    key: 'params',
                    label: `Params (${params.filter(p => p.enabled && p.key).length})`,
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Query parameters appended to the request URL
                          </Text>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => setParams(prev => [...prev, { id: `p_${Date.now()}`, key: '', value: '', enabled: true }])}
                          >
                            Add Param
                          </Button>
                        </div>
                        {params.length === 0 ? (
                          <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                            No query parameters configured. Click "Add Param" or type <code>?param=value</code> in the URL bar.
                          </div>
                        ) : (
                          <Space direction="vertical" style={{ width: '100%' }} size={6}>
                            {params.map((p, idx) => (
                              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <Checkbox
                                  checked={p.enabled}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setParams(prev => prev.map(item => item.id === p.id ? { ...item, enabled: checked } : item));
                                  }}
                                />
                                <Input
                                  size="small"
                                  placeholder="Parameter Key"
                                  value={p.key}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setParams(prev => prev.map(item => item.id === p.id ? { ...item, key: val } : item));
                                  }}
                                  style={{ width: '40%' }}
                                />
                                <Input
                                  size="small"
                                  placeholder="Value"
                                  value={p.value}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setParams(prev => prev.map(item => item.id === p.id ? { ...item, value: val } : item));
                                  }}
                                  style={{ width: '50%' }}
                                />
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => setParams(prev => prev.filter(item => item.id !== p.id))}
                                />
                              </div>
                            ))}
                          </Space>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'headers',
                    label: `Headers (${headers.filter(h => h.enabled && h.key).length})`,
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                          <Space>
                            <Button
                              size="small"
                              onClick={() => setHeaders(prev => [
                                ...prev.filter(h => h.key.toLowerCase() !== 'authorization'),
                                { id: `h_${Date.now()}`, key: 'Authorization', value: 'Bearer YOUR_TOKEN', enabled: true },
                              ])}
                            >
                              + Bearer Token
                            </Button>
                            <Button
                              size="small"
                              onClick={() => setHeaders(prev => [
                                ...prev.filter(h => h.key.toLowerCase() !== 'content-type'),
                                { id: `h_${Date.now()}`, key: 'Content-Type', value: 'application/json', enabled: true },
                              ])}
                            >
                              + JSON Content-Type
                            </Button>
                          </Space>
                          <Button
                            size="small"
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => setHeaders(prev => [...prev, { id: `h_${Date.now()}`, key: '', value: '', enabled: true }])}
                          >
                            Add Header
                          </Button>
                        </div>

                        <Space direction="vertical" style={{ width: '100%' }} size={6}>
                          {headers.map(h => (
                            <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <Checkbox
                                checked={h.enabled}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setHeaders(prev => prev.map(item => item.id === h.id ? { ...item, enabled: checked } : item));
                                }}
                              />
                              <Input
                                size="small"
                                placeholder="Header (e.g. Authorization)"
                                value={h.key}
                                onChange={e => {
                                  const val = e.target.value;
                                  setHeaders(prev => prev.map(item => item.id === h.id ? { ...item, key: val } : item));
                                }}
                                style={{ width: '40%' }}
                              />
                              <Input
                                size="small"
                                placeholder="Value"
                                value={h.value}
                                onChange={e => {
                                  const val = e.target.value;
                                  setHeaders(prev => prev.map(item => item.id === h.id ? { ...item, value: val } : item));
                                }}
                                style={{ width: '50%' }}
                              />
                              <Button
                                size="small"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => setHeaders(prev => prev.filter(item => item.id !== h.id))}
                              />
                            </div>
                          ))}
                        </Space>
                      </div>
                    ),
                  },
                  {
                    key: 'body',
                    label: `Body ${bodyType !== 'none' ? '(*)' : ''}`,
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Space>
                            <Select
                              size="small"
                              value={bodyType}
                              onChange={val => setBodyType(val)}
                              style={{ width: 140 }}
                              options={[
                                { label: 'none', value: 'none' },
                                { label: 'JSON (application/json)', value: 'json' },
                                { label: 'raw text', value: 'raw' },
                              ]}
                            />
                            {bodyType === 'json' && (
                              <Button size="small" icon={<CodeOutlined />} onClick={handleFormatJson}>
                                Prettify JSON
                              </Button>
                            )}
                          </Space>
                        </div>

                        {bodyType === 'none' ? (
                          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                            This request does not have a body. Select "JSON" to send a JSON payload.
                          </div>
                        ) : (
                          <TextArea
                            rows={6}
                            value={bodyContent}
                            onChange={e => setBodyContent(e.target.value)}
                            placeholder='{\n  "name": "Octocat",\n  "status": "active"\n}'
                            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'assertions',
                    label: `Assertions (${assertions.length})`,
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                          <Space wrap>
                            <Text type="secondary" style={{ fontSize: 12 }}>Quick Templates:</Text>
                            <Button size="small" onClick={() => addAssertion('status_code', 'eq', 200)}>
                              Status is 200
                            </Button>
                            <Button size="small" onClick={() => addAssertion('response_time', 'lt', 500)}>
                              Time &lt; 500ms
                            </Button>
                            <Button size="small" onClick={() => addAssertion('body_contains', 'contains', 'success')}>
                              Body has "success"
                            </Button>
                            <Button size="small" onClick={() => addAssertion('header_exists', 'exists', 'content-type')}>
                              Has Content-Type
                            </Button>
                          </Space>
                        </div>

                        <Space direction="vertical" style={{ width: '100%' }} size={8}>
                          {assertions.map(a => (
                            <div
                              key={a.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 12px',
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 8,
                                border: '1px solid var(--color-border)',
                              }}
                            >
                              <Select
                                size="small"
                                value={a.type}
                                style={{ width: 170 }}
                                onChange={val => setAssertions(prev => prev.map(item => item.id === a.id ? { ...item, type: val } : item))}
                                options={[
                                  { label: 'Status Code', value: 'status_code' },
                                  { label: 'Response Time (ms)', value: 'response_time' },
                                  { label: 'Body Contains', value: 'body_contains' },
                                  { label: 'Header Exists', value: 'header_exists' },
                                  { label: 'JSON Property Exists', value: 'json_path' },
                                ]}
                              />
                              <Select
                                size="small"
                                value={a.operator}
                                style={{ width: 110 }}
                                onChange={val => setAssertions(prev => prev.map(item => item.id === a.id ? { ...item, operator: val } : item))}
                                options={[
                                  { label: 'equals (==)', value: 'eq' },
                                  { label: 'less than (<)', value: 'lt' },
                                  { label: 'greater than (>)', value: 'gt' },
                                  { label: 'contains', value: 'contains' },
                                  { label: 'exists', value: 'exists' },
                                ]}
                              />
                              <Input
                                size="small"
                                value={String(a.expected)}
                                placeholder="Expected value"
                                onChange={e => {
                                  const val = e.target.value;
                                  setAssertions(prev => prev.map(item => item.id === a.id ? { ...item, expected: val } : item));
                                }}
                                style={{ flex: 1, fontFamily: 'monospace' }}
                              />
                              <Button
                                size="small"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => setAssertions(prev => prev.filter(item => item.id !== a.id))}
                              />
                            </div>
                          ))}
                        </Space>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>

            {/* Response Console (Postman / Playwright Style) */}
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={12}>
                    <span style={{ fontWeight: 600 }}>Live Response</span>
                    {activeResponse && (
                      <Space size={8}>
                        <span
                          className={
                            activeResponse.statusCode < 300
                              ? 'status-pill-2xx'
                              : activeResponse.statusCode < 400
                              ? 'status-pill-3xx'
                              : activeResponse.statusCode < 500
                              ? 'status-pill-4xx'
                              : 'status-pill-5xx'
                          }
                          style={{
                            fontSize: 12,
                            padding: '3px 9px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            lineHeight: 1.2,
                          }}
                        >
                          {getFormattedStatus(activeResponse.statusCode, activeResponse.statusText)}
                        </span>

                        <Tag icon={<ClockCircleOutlined />} color="default">
                          {activeResponse.responseTime} ms
                        </Tag>

                        <Tag color="default">
                          {activeResponse.sizeBytes ? `${(activeResponse.sizeBytes / 1024).toFixed(2)} KB` : '0 KB'}
                        </Tag>

                        {activeResponse.assertionResults && activeResponse.assertionResults.length > 0 && (
                          <Tag
                            color={activeResponse.status === 'passed' ? 'success' : 'error'}
                            icon={activeResponse.status === 'passed' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                          >
                            {activeResponse.assertionResults.filter(r => r.passed).length}/{activeResponse.assertionResults.length} Assertions Passed
                          </Tag>
                        )}
                      </Space>
                    )}
                  </Space>

                  {activeResponse && activeResponse.responseBody && (
                    <Tooltip title="Copy response body">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => {
                          navigator.clipboard.writeText(activeResponse.responseBody);
                          message.success('Response body copied to clipboard');
                        }}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                  )}
                </div>
              }
              className="card-modern"
              styles={{ body: { padding: '16px 20px' } }}
            >
              {running ? (
                <div style={{ textAlign: 'center', padding: '64px 0' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16, color: '#64748b', fontSize: 13 }}>
                    Sending request to {compiledUrl}...
                  </div>
                </div>
              ) : !activeResponse ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-tertiary)' }}>
                  <SendOutlined style={{ fontSize: 36, marginBottom: 12, color: 'var(--color-text-tertiary)' }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    Enter a URL and click "Send" to execute request and inspect response
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Supports live assertions, headers inspection, and JSON formatting like Postman.
                  </p>
                </div>
              ) : (
                <Tabs
                  activeKey={responseTab}
                  onChange={k => setResponseTab(k as any)}
                  items={[
                    {
                      key: 'body',
                      label: 'Body',
                      children: (
                        <div>
                          <pre
                            style={{
                              background: '#0f172a',
                              color: '#f8fafc',
                              padding: 16,
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: 'JetBrains Mono, monospace',
                              lineHeight: 1.6,
                              maxHeight: 420,
                              overflowX: 'auto',
                              overflowY: 'auto',
                              margin: 0,
                            }}
                          >
                            {activeResponse.responseBody || '(Empty Response Body)'}
                          </pre>
                        </div>
                      ),
                    },
                    {
                      key: 'assertions',
                      label: `Assertions (${activeResponse.assertionResults?.length || 0})`,
                      children: (
                        <div style={{ padding: '8px 0' }}>
                          {!activeResponse.assertionResults || activeResponse.assertionResults.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assertions configured for this request" />
                          ) : (
                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                              {activeResponse.assertionResults.map((ar, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 14px',
                                    background: ar.passed ? '#f0fdf4' : '#fef2f2',
                                    borderRadius: 8,
                                    border: `1px solid ${ar.passed ? '#bbf7d0' : '#fecaca'}`,
                                  }}
                                >
                                  <Space>
                                    {ar.passed ? (
                                      <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />
                                    ) : (
                                      <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16 }} />
                                    )}
                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                                      {ar.message || (ar.passed ? 'Assertion passed' : 'Assertion failed')}
                                    </span>
                                  </Space>
                                  <Tag color={ar.passed ? 'success' : 'error'}>
                                    {ar.passed ? 'PASSED' : 'FAILED'}
                                  </Tag>
                                </div>
                              ))}
                            </Space>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'headers',
                      label: `Headers (${Object.keys(activeResponse.responseHeaders || {}).length})`,
                      children: (
                        <Table
                          size="small"
                          pagination={false}
                          dataSource={Object.entries(activeResponse.responseHeaders || {}).map(([key, value]) => ({ key, value }))}
                          columns={[
                            { title: 'Header', dataIndex: 'key', key: 'key', width: '35%', render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#4338ca' }}>{v}</span> },
                            { title: 'Value', dataIndex: 'value', key: 'value', render: (v) => <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{v}</span> },
                          ]}
                          scroll={{ y: 320 }}
                        />
                      ),
                    },
                    {
                      key: 'info',
                      label: 'Execution Details',
                      children: (
                        <div style={{ padding: '8px 0', fontSize: 13 }}>
                          <p><strong>Resolved Target URL:</strong> <code>{activeResponse.targetUrl || compiledUrl}</code></p>
                          <p><strong>Executed At:</strong> {new Date(activeResponse.runAt).toLocaleString()}</p>
                          <p><strong>Status:</strong> <Tag color={statusColor(activeResponse.status)}>{activeResponse.status.toUpperCase()}</Tag></p>
                          {activeResponse.error && (
                            <p style={{ color: '#ef4444' }}><strong>Error Details:</strong> {activeResponse.error}</p>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          </Space>
        </Col>
      </Row>

      {/* Save Test Case Modal */}
      <Modal
        title={selectedCaseId ? 'Update Saved Test Case' : 'Save As Test Case'}
        open={isSaveModalOpen}
        onOk={handleSaveTestCase}
        onCancel={() => setIsSaveModalOpen(false)}
        okText={selectedCaseId ? 'Update Test Case' : 'Save Test Case'}
        destroyOnClose
      >
        <Form form={saveForm} layout="vertical">
          <Form.Item
            name="name"
            label="Test Case Name"
            rules={[{ required: true, message: 'Please enter a name for this test' }]}
          >
            <Input placeholder="e.g. Verify User Search API Returns 200" />
          </Form.Item>

          <Form.Item
            name="endpointId"
            label="Associate With Registered Endpoint (Optional)"
          >
            <Select placeholder="None (Stand-alone custom test)" allowClear>
              {endpoints.map(ep => (
                <Select.Option key={ep.id} value={ep.id}>
                  {ep.method} {ep.path} ({ep.name})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12, color: '#64748b' }}>
            <p style={{ margin: '0 0 4px 0' }}><strong>Method:</strong> <HttpMethodTag method={method} size="sm" /></p>
            <p style={{ margin: '0 0 4px 0' }}><strong>Target URL:</strong> <code>{compiledUrl}</code></p>
            <p style={{ margin: 0 }}><strong>Assertions:</strong> {assertions.length} configured</p>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
