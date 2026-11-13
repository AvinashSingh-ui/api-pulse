import React, { useState, useEffect, useCallback } from 'react';
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
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader }    from '@/components/common/PageHeader';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { useResponsive } from '@/hooks/useResponsive';
import { testingService } from '@/services/endpoints/testing';
import { endpointsService } from '@/services/endpoints/endpoints';
import type { TestCase, TestStatus, Endpoint, TestResult } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

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

/**
 * TestingPage:
 * - Automated synthetic API testing suite and HTTP endpoint assertion verification.
 * - Beginner-Friendly Architecture:
 *   1. Safe Input Parsing: Protects against invalid JSON syntax when users supply custom HTTP headers.
 *   2. Responsive Layout: Side-by-side test case list and test execution console adjust dynamically for tablet/mobile.
 *   3. Live Execution: Executes synthetic HTTP assertions against endpoints and displays status, duration, and body response.
 */
export default function TestingPage() {
  const navigate = useNavigate();
  const { isTablet } = useResponsive();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selected, setSelected] = useState<TestCase | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<{ status: number; time: number; body: string; passed: boolean } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [casesRes, epRes] = await Promise.all([
        testingService.listTestCases().catch(() => ({ data: [] })),
        endpointsService.list({ pageSize: 100 }).catch(() => ({ data: [] })),
      ]);

      const cases = casesRes.data || [];
      setTestCases(cases);
      setEndpoints(epRes.data || []);
      if (cases.length > 0) {
        setSelected((prev) => (prev ? cases.find((c) => c.id === prev.id) || cases[0] : cases[0]));
      } else {
        setSelected(null);
      }
    } catch (err) {
      console.error('Failed to load test cases:', err);
      message.error('Failed to load test cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRun = async () => {
    if (!selected) return;
    setRunning(true);
    setTestResult(null);

    try {
      const res: any = await testingService.runTest(selected.id);
      const passed = res.passed ?? (res.status < 400);
      setTestResult({
        status: res.status ?? 200,
        time: res.responseTime ?? 85,
        body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body || res, null, 2),
        passed,
      });

      setTestCases((prev) =>
        prev.map((t) =>
          t.id === selected.id
            ? { ...t, lastStatus: passed ? 'passed' : 'failed', lastRunAt: new Date().toISOString() }
            : t
        )
      );
      message.success(`Test completed: HTTP ${res.status || 200}`);
    } catch (err: any) {
      message.error(err.message || 'Test execution failed');
      setTestResult({
        status: 500,
        time: 0,
        body: JSON.stringify({ error: err.message || 'Request failed' }, null, 2),
        passed: false,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCreateTestCase = async () => {
    try {
      const values = await form.validateFields();

      // Safe JSON parsing: prevent crash if user types invalid JSON in custom headers
      let parsedHeaders = { Accept: 'application/json' };
      if (values.headers && values.headers.trim()) {
        try {
          parsedHeaders = JSON.parse(values.headers);
        } catch {
          message.error('Custom headers must be a valid JSON object, e.g. {"Authorization": "Bearer token"}');
          return;
        }
      }

      const newCase = await testingService.createTestCase({
        name: values.name,
        endpointId: values.endpointId,
        method: values.method || 'GET',
        url: values.url,
        headers: parsedHeaders,
        body: values.body || undefined,
        assertions: [
          {
            id: `a_${Date.now()}`,
            type: 'status_code',
            expected: Number(values.expectedStatus || 200),
            operator: 'eq',
          },
        ],
      });

      setTestCases((prev) => [newCase, ...prev]);
      setSelected(newCase);
      setIsModalOpen(false);
      form.resetFields();
      message.success('Test case created');
    } catch (err: any) {
      if (err.message) message.error(err.message);
    }
  };

  const handleEndpointSelect = (endpointId: string) => {
    const ep = endpoints.find((e) => e.id === endpointId);
    if (ep) {
      form.setFieldsValue({
        method: ep.method,
        url: ep.path,
        name: `Verify ${ep.method} ${ep.path}`,
        expectedStatus: ep.expectedStatus || 200,
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="API Testing & Verification"
        subtitle="Automated synthetic assertion test suites and HTTP endpoint verification"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              New Test Case
            </Button>
          </Space>
        }
      />

      {testCases.length === 0 && !loading ? (
        <Card style={{ borderRadius: 12, padding: '48px 0', textAlign: 'center' }}>
          <Empty
            description={
              <span>
                <strong>No Test Cases Created</strong>
                <br />
                <span style={{ color: '#64748b' }}>
                  Create an automated test case to assert HTTP status codes, latency thresholds, and payloads.
                </span>
              </span>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Create Your First Test Case
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]} style={{ minHeight: isTablet ? 'auto' : 'calc(100vh - 220px)' }}>
          {/* Test case list */}
          <Col xs={24} lg={8}>
            <Card
              title={
                <span>
                  Test Cases{' '}
                  <Tag style={{ marginLeft: 4 }}>{testCases.length}</Tag>
                </span>
              }
              style={{ height: isTablet ? 320 : '100%', overflow: 'auto' }}
              styles={{ body: { padding: 0 } }}
            >
              <List
                dataSource={testCases}
                renderItem={(item) => (
                  <List.Item
                    onClick={() => {
                      setSelected(item);
                      setTestResult(null);
                    }}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: selected?.id === item.id ? '#eff6ff' : 'transparent',
                      borderLeft:
                        selected?.id === item.id
                          ? '3px solid #4f8ef7'
                          : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {statusIcon(item.lastStatus)}
                          <span
                            style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}
                          >
                            {item.name}
                          </span>
                        </div>
                        <Tag
                          color={statusColor(item.lastStatus)}
                          style={{ fontSize: 10 }}
                        >
                          {(item.lastStatus ?? 'pending').toUpperCase()}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HttpMethodTag method={item.method} size="sm" />
                        <span
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            fontFamily: 'monospace',
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
                )}
              />
            </Card>
          </Col>

          {/* Test runner */}
          <Col xs={24} lg={16}>
            {selected && (
              <Card
                title={
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HttpMethodTag method={selected.method} />
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: '#475569',
                        }}
                      >
                        {selected.name}
                      </span>
                    </div>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleRun}
                      loading={running}
                      style={{ background: '#22c55e', borderColor: '#22c55e' }}
                    >
                      Run Test
                    </Button>
                  </div>
                }
                style={{ height: '100%' }}
                styles={{
                  body: {
                    padding: 0,
                    height: 'calc(100% - 57px)',
                    overflow: 'auto',
                  },
                }}
              >
                <Tabs
                  style={{ padding: '0 16px' }}
                  items={[
                    {
                      key: 'request',
                      label: 'Request',
                      children: (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                marginBottom: 6,
                                letterSpacing: '0.05em',
                              }}
                            >
                              TARGET URL
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Input
                                value={`${selected.method} ${selected.url}`}
                                readOnly
                                style={{ fontFamily: 'monospace', fontSize: 12 }}
                              />
                            </div>
                          </div>

                          {/* Headers */}
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                marginBottom: 6,
                                letterSpacing: '0.05em',
                              }}
                            >
                              HEADERS
                            </div>
                            <div
                              style={{
                                background: '#f8fafc',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                padding: '10px 14px',
                              }}
                            >
                              {selected.headers && Object.keys(selected.headers).length > 0 ? (
                                Object.entries(selected.headers).map(([k, v]) => (
                                  <div
                                    key={k}
                                    style={{
                                      display: 'flex',
                                      gap: 8,
                                      marginBottom: 4,
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    <span style={{ color: '#7c5cfc', minWidth: 160 }}>
                                      {k}:
                                    </span>
                                    <span style={{ color: '#475569' }}>{v}</span>
                                  </div>
                                ))
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 12 }}>None configured</span>
                              )}
                            </div>
                          </div>

                          {/* Body */}
                          {selected.body && (
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#94a3b8',
                                  marginBottom: 6,
                                  letterSpacing: '0.05em',
                                }}
                              >
                                BODY
                              </div>
                              <TextArea
                                value={selected.body}
                                rows={5}
                                readOnly
                                style={{ fontFamily: 'monospace', fontSize: 12 }}
                              />
                            </div>
                          )}
                        </Space>
                      ),
                    },
                    {
                      key: 'assertions',
                      label: `Assertions (${selected.assertions?.length || 0})`,
                      children: (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          {(selected.assertions || []).map((a) => (
                            <div
                              key={a.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 14px',
                                background: '#f8fafc',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <Tag color="blue" style={{ fontSize: 10 }}>
                                {a.type.replace(/_/g, ' ').toUpperCase()}
                              </Tag>
                              <span style={{ fontSize: 12, color: '#64748b' }}>
                                {a.operator}
                              </span>
                              <code
                                style={{
                                  fontSize: 12,
                                  background: '#e2e8f0',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                {a.expected}
                              </code>
                            </div>
                          ))}
                        </Space>
                      ),
                    },
                    {
                      key: 'response',
                      label: 'Response',
                      children: running ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            padding: 40,
                          }}
                        >
                          <Spin size="large" />
                        </div>
                      ) : testResult ? (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div
                            style={{
                              display: 'flex',
                              gap: 16,
                              alignItems: 'center',
                            }}
                          >
                            <Tag
                              color={
                                testResult.status < 300
                                  ? 'success'
                                  : testResult.status < 500
                                  ? 'warning'
                                  : 'error'
                              }
                              style={{ fontSize: 14, padding: '2px 10px' }}
                            >
                              {testResult.status}
                            </Tag>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                              ⏱ {testResult.time}ms
                            </span>
                            <Tag color={testResult.passed ? 'success' : 'error'}>
                              {testResult.passed ? 'ASSERTIONS PASSED' : 'ASSERTIONS FAILED'}
                            </Tag>

                            {!testResult.passed && selected?.endpointId && (
                              <Button
                                size="small"
                                type="primary"
                                danger
                                icon={<RobotOutlined />}
                                onClick={() => navigate(`/alerts?endpointId=${selected.endpointId}&aiFix=true`)}
                                style={{ marginLeft: 'auto', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                View AI Fix in Alerts
                              </Button>
                            )}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                marginBottom: 6,
                                letterSpacing: '0.05em',
                              }}
                            >
                              RESPONSE BODY
                            </div>
                            <pre
                              style={{
                                background: '#0f172a',
                                color: '#e2e8f0',
                                padding: '14px 16px',
                                borderRadius: 8,
                                fontSize: 12,
                                lineHeight: 1.6,
                                overflowX: 'auto',
                                maxHeight: 300,
                              }}
                            >
                              {testResult.body}
                            </pre>
                          </div>
                        </Space>
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            padding: 48,
                            color: '#94a3b8',
                          }}
                        >
                          <PlayCircleOutlined
                            style={{ fontSize: 32, marginBottom: 12 }}
                          />
                          <p>Click "Run Test" to execute against the target endpoint</p>
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            )}
          </Col>
        </Row>
      )}

      {/* New Test Case Modal */}
      <Modal
        title="Create Synthetic Test Case"
        open={isModalOpen}
        onOk={handleCreateTestCase}
        onCancel={() => setIsModalOpen(false)}
        okText="Create Test Case"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ method: 'GET', expectedStatus: 200 }}>
          <Form.Item
            name="endpointId"
            label="Associate With Endpoint"
            rules={[{ required: true, message: 'Please select an endpoint' }]}
          >
            <Select placeholder="Select an endpoint" onChange={handleEndpointSelect}>
              {endpoints.map((ep) => (
                <Select.Option key={ep.id} value={ep.id}>
                  {ep.method} {ep.path} ({ep.name})
                </Select.Option>  
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="Test Name"
            rules={[{ required: true, message: 'Please provide a test name' }]}
          >
            <Input placeholder="e.g. Verify 200 OK on User Search" />
          </Form.Item>

          <Row gutter={8}>
            <Col span={8}>
              <Form.Item name="method" label="Method">
                <Select>
                  <Select.Option value="GET">GET</Select.Option>
                  <Select.Option value="POST">POST</Select.Option>
                  <Select.Option value="PUT">PUT</Select.Option>
                  <Select.Option value="PATCH">PATCH</Select.Option>
                  <Select.Option value="DELETE">DELETE</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                name="url"
                label="Target URL / Path"
                rules={[{ required: true, message: 'Please enter target URL' }]}
              >
                <Input placeholder="https://api.example.com/v1/resource or /api/v1/..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="expectedStatus" label="Expected HTTP Status">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="headers" label="Headers (JSON, optional)">
            <TextArea rows={2} placeholder='{"Authorization": "Bearer token"}' />
          </Form.Item>

          <Form.Item name="body" label="Request Body (optional)">
            <TextArea rows={3} placeholder='{"key": "value"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
