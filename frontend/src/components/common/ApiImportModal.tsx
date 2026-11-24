import React, { useState, useEffect } from 'react';
import {
  Modal, Tabs, Form, Input, Button, Table, Tag, Space, Alert,
  Select, Upload, Card, Typography, Tooltip, message, Spin, Checkbox, Segmented,
} from 'antd';
import {
  ImportOutlined, CloudUploadOutlined, CodeOutlined,
  GlobalOutlined, CheckCircleOutlined, PlusOutlined,
  ApiOutlined, FileTextOutlined, LinkOutlined,
  ThunderboltOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { openapiService, ParsedEndpointPreview, ImportPreviewResult } from '@/services/endpoints/openapi';
import { projectsService } from '@/services/endpoints/projects';
import type { Project, HttpMethod } from '@/types';
import { HttpMethodTag } from './HttpMethodTag';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const METHOD_COLORS: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  PATCH: 'purple',
  DELETE: 'red',
  HEAD: 'default',
  OPTIONS: 'cyan',
};

interface ApiImportModalProps {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onSuccess?: (res: { project?: Project; addedCount: number; updatedCount: number }) => void;
}

export const ApiImportModal: React.FC<ApiImportModalProps> = ({
  open,
  onClose,
  defaultProjectId,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'openapi' | 'postman' | 'curl' | 'routes'>('openapi');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Target Project selection
  const [targetType, setTargetType] = useState<'existing' | 'new'>(defaultProjectId ? 'existing' : 'new');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || '');

  // New Project Form Data
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectBaseUrl, setNewProjectBaseUrl] = useState('');
  const [newProjectEnv, setNewProjectEnv] = useState<'production' | 'staging' | 'development'>('production');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectBearerToken, setNewProjectBearerToken] = useState('');

  // Tab inputs
  const [openapiUrl, setOpenapiUrl] = useState('');
  const [openapiRaw, setOpenapiRaw] = useState('');
  const [postmanRaw, setPostmanRaw] = useState('');
  const [curlRaw, setCurlRaw] = useState('');
  const [routesRaw, setRoutesRaw] = useState('');

  // Preview State
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Fetch active projects on open
  useEffect(() => {
    if (open) {
      setIsLoadingProjects(true);
      projectsService.list({ tab: 'active' })
        .then(res => {
          setProjects(res.data || []);
          if (defaultProjectId) {
            setSelectedProjectId(defaultProjectId);
            setTargetType('existing');
          } else if (res.data && res.data.length > 0) {
            setSelectedProjectId(res.data[0].id);
          } else {
            setTargetType('new');
          }
        })
        .catch(() => message.error('Failed to load projects list'))
        .finally(() => setIsLoadingProjects(false));
    }
  }, [open, defaultProjectId]);

  // Reset state when closed
  const handleClose = () => {
    setPreviewResult(null);
    setSelectedRowKeys([]);
    setOpenapiUrl('');
    setOpenapiRaw('');
    setPostmanRaw('');
    setCurlRaw('');
    setRoutesRaw('');
    setNewProjectName('');
    setNewProjectBaseUrl('');
    setNewProjectDesc('');
    onClose();
  };

  // Generate preview based on active tab
  const handleGeneratePreview = async () => {
    let rawContent = '';
    let url: string | undefined;

    if (activeTab === 'openapi') {
      if (openapiUrl.trim()) {
        url = openapiUrl.trim();
      } else if (openapiRaw.trim()) {
        rawContent = openapiRaw.trim();
      } else {
        message.warning('Please enter an OpenAPI URL or paste OpenAPI JSON / YAML content.');
        return;
      }
    } else if (activeTab === 'postman') {
      if (!postmanRaw.trim()) {
        message.warning('Please paste or upload Postman Collection JSON.');
        return;
      }
      rawContent = postmanRaw.trim();
    } else if (activeTab === 'curl') {
      if (!curlRaw.trim()) {
        message.warning('Please paste one or more cURL commands.');
        return;
      }
      rawContent = curlRaw.trim();
    } else if (activeTab === 'routes') {
      if (!routesRaw.trim()) {
        message.warning('Please enter route paths (e.g. GET /api/v1/users).');
        return;
      }
      rawContent = routesRaw.trim();
    }

    setIsPreviewLoading(true);
    try {
      const res = await openapiService.preview({
        rawContent,
        url,
        projectId: targetType === 'existing' ? selectedProjectId : undefined,
        format: activeTab,
      });

      if (res.endpoints.length === 0) {
        message.warning('No valid endpoints found in the provided content.');
      } else {
        message.success(`Parsed ${res.endpoints.length} endpoint(s) successfully!`);
      }

      setPreviewResult(res);
      // Select all by default
      setSelectedRowKeys(res.endpoints.map((_, i) => i));

      // Auto-suggest project fields if creating a new project
      if (targetType === 'new') {
        if (!newProjectName && res.title && res.title !== 'OpenAPI Import') {
          setNewProjectName(res.title);
        }
        if (!newProjectBaseUrl && res.suggestedBaseUrl) {
          setNewProjectBaseUrl(res.suggestedBaseUrl);
        }
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || err.message || 'Failed to parse API specification.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Import Action
  const handleImport = async () => {
    if (!previewResult || selectedRowKeys.length === 0) {
      message.warning('Please select at least one endpoint to import.');
      return;
    }

    if (targetType === 'new') {
      if (!newProjectName.trim()) {
        message.error('Please enter a Project Name.');
        return;
      }
      if (!newProjectBaseUrl.trim()) {
        message.error('Please enter an Application Deployed Link / Base Server URL.');
        return;
      }
    } else if (!selectedProjectId) {
      message.error('Please select an existing project.');
      return;
    }

    const selectedEndpoints = selectedRowKeys.map(key => previewResult.endpoints[Number(key)]);

    setIsImporting(true);
    try {
      const res = await openapiService.importSpec({
        projectId: targetType === 'existing' ? selectedProjectId : undefined,
        endpoints: selectedEndpoints,
        newProjectData: targetType === 'new' ? {
          name: newProjectName.trim(),
          baseUrl: newProjectBaseUrl.trim(),
          environment: newProjectEnv,
          description: newProjectDesc.trim() || `Imported via ${previewResult.format.toUpperCase()} (${selectedEndpoints.length} endpoints)`,
          tags: [previewResult.format, 'imported'],
          bearerToken: newProjectBearerToken.trim() || undefined,
        } : undefined,
      });

      message.success(res.message || `Successfully imported ${selectedEndpoints.length} endpoints!`);
      if (onSuccess) {
        onSuccess({
          project: res.project,
          addedCount: res.addedCount,
          updatedCount: res.updatedCount,
        });
      }
      handleClose();
    } catch (err: any) {
      message.error(err.response?.data?.message || err.message || 'Failed to import endpoints.');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle JSON/YAML file upload
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (activeTab === 'openapi') setOpenapiRaw(text);
      else if (activeTab === 'postman') setPostmanRaw(text);
      else if (activeTab === 'curl') setCurlRaw(text);
      else if (activeTab === 'routes') setRoutesRaw(text);
      message.success(`File "${file.name}" loaded into editor.`);
    };
    reader.readAsText(file);
    return false; // Prevent upload
  };

  // Table Columns for Preview
  const columns: ColumnsType<ParsedEndpointPreview> = [
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 90,
      render: (m: HttpMethod) => <HttpMethodTag method={m} size="sm" />,
    },
    {
      title: 'Endpoint Path',
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => (
        <Text code style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>
          {path}
        </Text>
      ),
    },
    {
      title: 'Summary / Name',
      dataIndex: 'summary',
      key: 'summary',
      render: (s: string) => (
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {s || 'No summary'}
        </span>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => (
        <Tag color={action === 'create' ? 'success' : 'default'} style={{ fontWeight: 600 }}>
          {action === 'create' ? 'NEW' : 'UPDATE'}
        </Tag>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="modal-icon-badge">
            <ImportOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              API Import & Integration Center
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400, marginTop: 1 }}>
              Import routes from OpenAPI, Swagger, Postman Collections, cURL commands, or raw route lists
            </div>
          </div>
        </div>
      }
      width={860}
      style={{ maxWidth: '95vw', top: 30 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {previewResult && (
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Selected: <strong style={{ color: 'var(--color-text)' }}>{selectedRowKeys.length}</strong> of {previewResult.endpoints.length} endpoints
              </span>
            )}
          </div>
          <Space size={10}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleGeneratePreview}
              loading={isPreviewLoading}
            >
              Parse & Preview
            </Button>
            <Button
              type="primary"
              className="btn-primary-gradient"
              icon={<CheckCircleOutlined />}
              onClick={handleImport}
              loading={isImporting}
              disabled={!previewResult || selectedRowKeys.length === 0}
            >
              {targetType === 'new'
                ? `Create Project & Import (${selectedRowKeys.length})`
                : `Import ${selectedRowKeys.length} Endpoints`}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ marginTop: 14 }}>
        {/* Step 1: Destination Selection (Clean Monochromatic Segmented Control) */}
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 12,
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            marginBottom: 16,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Segmented<'new' | 'existing'>
              value={targetType}
              onChange={(val) => setTargetType(val)}
              block
              size="middle"
              options={[
                {
                  label: (
                    <Space size={6} style={{ padding: '2px 0' }}>
                      <PlusOutlined />
                      <span style={{ fontWeight: 600 }}>Create New Project from Import</span>
                    </Space>
                  ),
                  value: 'new',
                },
                {
                  label: (
                    <Space size={6} style={{ padding: '2px 0' }}>
                      <ApiOutlined />
                      <span style={{ fontWeight: 600 }}>Add to Existing Project</span>
                    </Space>
                  ),
                  value: 'existing',
                  disabled: projects.length === 0,
                },
              ]}
            />
          </div>

          {targetType === 'new' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                  Project Name <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <Input
                  placeholder="e.g. Orders Microservice"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                  <span>Base Server URL <span style={{ color: 'var(--color-error)' }}>*</span></span>
                  <Tooltip title="Your server base URL (e.g. https://api.example.com or http://localhost:8000)">
                    <InfoCircleOutlined style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }} />
                  </Tooltip>
                </label>
                <Input
                  placeholder="https://api.example.com"
                  value={newProjectBaseUrl}
                  onChange={e => setNewProjectBaseUrl(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                  Environment
                </label>
                <Select
                  value={newProjectEnv}
                  onChange={setNewProjectEnv}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'Production', value: 'production' },
                    { label: 'Staging', value: 'staging' },
                    { label: 'Development', value: 'development' },
                  ]}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                  <span>Auth Token / Bearer Key (Optional)</span>
                  <Tooltip title="If the API requires authentication, paste your Bearer token or JWT here. It will automatically authorize all imported endpoints.">
                    <InfoCircleOutlined style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }} />
                  </Tooltip>
                </label>
                <Input.Password
                  placeholder="e.g. eyJhbGciOi..."
                  value={newProjectBearerToken}
                  onChange={e => setNewProjectBearerToken(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                Select Target Project
              </label>
              <Select
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                loading={isLoadingProjects}
                options={projects.map(p => ({
                  label: `${p.name} (${p.baseUrl})`,
                  value: p.id,
                }))}
              />
            </div>
          )}
        </div>

        {/* Step 2: Import Method Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={k => setActiveTab(k as any)}
          items={[
            {
              key: 'openapi',
              label: (
                <span>
                  <GlobalOutlined /> OpenAPI / Swagger
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                      Option A: Live Documentation URL (Swagger JSON, OpenAPI 3.0, or Swagger UI)
                    </label>
                    <Input
                      prefix={<LinkOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
                      placeholder="e.g. https://api.example.com/v3/api-docs or https://api.example.com/swagger-ui/index.html"
                      value={openapiUrl}
                      onChange={e => setOpenapiUrl(e.target.value)}
                      allowClear
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600 }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Option B: Paste Specification (JSON or YAML)
                      </label>
                      <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".json,.yaml,.yml">
                        <Button size="small" icon={<CloudUploadOutlined />}>Upload File</Button>
                      </Upload>
                    </div>
                    <TextArea
                      rows={6}
                      placeholder={`openapi: 3.0.0\ninfo:\n  title: My Service API\n  version: 1.0.0\npaths:\n  /users:\n    get:\n      summary: List all users\n    post:\n      summary: Create new user`}
                      value={openapiRaw}
                      onChange={e => setOpenapiRaw(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        background: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'postman',
              label: (
                <span>
                  <FileTextOutlined /> Postman Collection
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Export your Postman collection as JSON (Collection v2.1 recommended) and paste it below or upload the file."
                  />
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Paste Postman Collection JSON
                      </label>
                      <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".json">
                        <Button size="small" icon={<CloudUploadOutlined />}>Upload .json File</Button>
                      </Upload>
                    </div>
                    <TextArea
                      rows={8}
                      placeholder={`{\n  "info": {\n    "name": "My API Collection",\n    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"\n  },\n  "item": [\n    {\n      "name": "Get Account Profile",\n      "request": {\n        "method": "GET",\n        "url": "https://api.example.com/v1/profile"\n      }\n    }\n  ]\n}`}
                      value={postmanRaw}
                      onChange={e => setPostmanRaw(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        background: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'curl',
              label: (
                <span>
                  <CodeOutlined /> cURL Commands
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Paste one or multiple cURL commands (e.g. from Chrome DevTools 'Copy as cURL', Postman, or terminal). Each command will be converted into an endpoint."
                  />
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                      Paste cURL Command(s)
                    </label>
                    <TextArea
                      rows={8}
                      placeholder={`curl -X GET "https://api.example.com/v1/users?status=active" -H "Authorization: Bearer token"\n\ncurl -X POST "https://api.example.com/v1/orders" -H "Content-Type: application/json" -d '{"item":"book"}'`}
                      value={curlRaw}
                      onChange={e => setCurlRaw(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        background: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'routes',
              label: (
                <span>
                  <ApiOutlined /> Batch Route List
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Quickly specify routes line-by-line in format: METHOD /path - Optional Description"
                  />
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                      Route Definitions (One per line)
                    </label>
                    <TextArea
                      rows={8}
                      placeholder={`GET /api/v1/users - List users\nPOST /api/v1/users - Create new user\nGET /api/v1/users/:id - Get user by ID\nPUT /api/v1/users/:id - Update user details\nDELETE /api/v1/users/:id - Delete user\nGET /api/v1/health - System health check`}
                      value={routesRaw}
                      onChange={e => setRoutesRaw(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        background: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />

        {/* Step 3: Parsed Endpoints Preview */}
        {previewResult && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
                  Discovered Endpoints ({previewResult.endpoints.length})
                </span>
                <Tag style={{ textTransform: 'uppercase', fontWeight: 600, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  {previewResult.format}
                </Tag>
                {previewResult.suggestedBaseUrl && (
                  <Text code style={{ fontSize: 12 }}>
                    Origin: {previewResult.suggestedBaseUrl}
                  </Text>
                )}
              </div>
              <Space>
                <Button
                  size="small"
                  onClick={() => setSelectedRowKeys(previewResult.endpoints.map((_, i) => i))}
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  onClick={() => setSelectedRowKeys([])}
                >
                  Deselect All
                </Button>
              </Space>
            </div>

            <Table
              dataSource={previewResult.endpoints}
              columns={columns}
              rowKey={(_, index) => index as number}
              pagination={{ pageSize: 6, size: 'small', showTotal: (t) => `${t} total endpoints` }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              size="small"
              bordered
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
