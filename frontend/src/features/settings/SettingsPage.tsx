import React, { useState } from 'react';
import {
  Tabs, Card, Form, Input, Button, Space, Switch, Table,
  Avatar, Divider, Tag, Tooltip, message, Row, Col,
} from 'antd';
import {
  UserOutlined, BellOutlined, KeyOutlined, TeamOutlined,
  CopyOutlined, DeleteOutlined, PlusOutlined,
  EyeOutlined, EyeInvisibleOutlined, SoundOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, AlertOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/common/PageHeader';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { setPreferences } from '@/features/notifications/notificationsSlice';
import { playNotificationSound } from '@/utils/audio';
import { formatDate } from '@/utils';
import type { ColumnsType } from 'antd/es/table';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
  scopes: string[];
}

const MOCK_API_KEYS: ApiKey[] = [
  {
    id: 'k1',
    name: 'Production Monitor',
    key: 'pi_sk_prod_x4f2a...k9m3',
    createdAt: '2024-01-15T10:00:00Z',
    lastUsed: '2024-11-08T14:23:00Z',
    scopes: ['read', 'monitoring'],
  },
  {
    id: 'k2',
    name: 'CI/CD Integration',
    key: 'pi_sk_cicd_j7n8b...p2q1',
    createdAt: '2024-03-20T10:00:00Z',
    lastUsed: '2024-11-09T08:00:00Z',
    scopes: ['read', 'testing'],
  },
  {
    id: 'k3',
    name: 'Slack Webhook',
    key: 'pi_sk_wh_m3k9z...r7t5',
    createdAt: '2024-05-10T10:00:00Z',
    lastUsed: '2024-11-07T18:00:00Z',
    scopes: ['alerts'],
  },
];

// ---------------------------------------------------------------------------
// Notification settings metadata
// ---------------------------------------------------------------------------
const NOTIFICATION_EVENTS = [
  { label: 'Critical alerts',        key: 'critical', description: 'Receive immediately when a critical issue occurs',       defaultChecked: true  },
  { label: 'High severity alerts',   key: 'high',     description: 'Receive for high severity alerts',                       defaultChecked: true  },
  { label: 'Medium severity alerts', key: 'medium',   description: 'Receive for medium severity alerts',                     defaultChecked: false },
  { label: 'Weekly digest',          key: 'digest',   description: 'Weekly summary of your API performance',                 defaultChecked: true  },
  { label: 'AI insights',            key: 'ai',       description: 'Get notified when AI detects important patterns',        defaultChecked: true  },
  { label: 'Test failures',          key: 'tests',    description: 'Notify when automated tests fail',                       defaultChecked: true  },
];

const NOTIFICATION_CHANNELS = [
  { label: 'Email Notifications', key: 'email',   defaultChecked: true  },
  { label: 'Slack Integration',   key: 'slack',   defaultChecked: true  },
  { label: 'SMS Alerts',          key: 'sms',     defaultChecked: false },
  { label: 'Webhook',             key: 'webhook', defaultChecked: false },
];

// ---------------------------------------------------------------------------
// Profile Tab
// ---------------------------------------------------------------------------
const ProfileTab: React.FC = () => {
  const user   = useAppSelector(s => s.auth.user);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    await form.validateFields();
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    message.success('Profile updated successfully');
  };

  return (
    <Card style={{ borderRadius: 12, maxWidth: 600 }}>
      {/* Avatar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Avatar
          size={72}
          src={user?.avatar}
          style={{ background: '#4f8ef7', fontSize: 28, fontWeight: 700 }}
        >
          {user?.name?.charAt(0).toUpperCase() ?? 'U'}
        </Avatar>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            {user?.name ?? 'User'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{user?.email}</div>
          <Tag color="blue" style={{ marginTop: 4 }}>
            {user?.role ?? 'admin'}
          </Tag>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: user?.name ?? '', email: user?.email ?? '' }}
        onFinish={handleSave}
      >
        <Form.Item
          name="name"
          label="Full Name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email Address"
          rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
        >
          <Input style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item name="avatar" label="Avatar URL">
          <Input placeholder="https://…" style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item label="Role">
          <Input
            value={user?.role ?? 'admin'}
            disabled
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            style={{ borderRadius: 8 }}
          >
            Save Changes
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Notifications Tab
// ---------------------------------------------------------------------------
const NotificationsTab: React.FC = () => {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(s => s.notifications.preferences);

  const handleSoundTest = (type: 'critical' | 'warning' | 'success') => {
    playNotificationSound(type);
    const label = type === 'critical' ? 'Urgent alarm' : type === 'warning' ? 'Degraded chime' : 'Recovery chord';
    message.info(`Played ${label} test sound`);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Sound Alerts & Audio Synthesizer */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SoundOutlined style={{ color: '#0958d9' }} />
            <span>Audio Notification & Alert Sound System</span>
          </div>
        }
        style={{ borderRadius: 12, marginBottom: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Enable Sound Alerts</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Master switch to play audible tones when critical incidents, degradations, or recoveries occur.
            </div>
          </div>
          <Switch
            checked={prefs.soundEnabled}
            onChange={(checked) => dispatch(setPreferences({ soundEnabled: checked }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: '#0f172a' }}>Critical Alert Tone (Unhealthy / Unavailable APIs)</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Urgent dual-tone alarm triggered on endpoint failures, 5xx outages, and downtime.
            </div>
          </div>
          <Switch
            checked={prefs.soundOnCritical}
            disabled={!prefs.soundEnabled}
            onChange={(checked) => dispatch(setPreferences({ soundOnCritical: checked }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: '#0f172a' }}>Warning Chime (Degraded Performance / Latency Spikes)</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Gentle chime when an endpoint exceeds configured latency threshold or experiences degradation.
            </div>
          </div>
          <Switch
            checked={prefs.soundOnWarning}
            disabled={!prefs.soundEnabled}
            onChange={(checked) => dispatch(setPreferences({ soundOnWarning: checked }))}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: '#0f172a' }}>Recovery Tone (API Returned to Healthy)</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Ascending harmonic chord played when a degraded or unhealthy API fully recovers.
            </div>
          </div>
          <Switch
            checked={prefs.soundOnRecovery}
            disabled={!prefs.soundEnabled}
            onChange={(checked) => dispatch(setPreferences({ soundOnRecovery: checked }))}
          />
        </div>

        {/* Audio Test Controls */}
        <div style={{ marginTop: 20, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 10 }}>
            Test Synthesizer Sounds (Web Audio API)
          </div>
          <Space wrap>
            <Button
              size="small"
              danger
              icon={<AlertOutlined />}
              onClick={() => handleSoundTest('critical')}
            >
              Test Urgent Sound (Critical)
            </Button>
            <Button
              size="small"
              style={{ color: '#d97706', borderColor: '#d97706' }}
              icon={<ExclamationCircleOutlined />}
              onClick={() => handleSoundTest('warning')}
            >
              Test Degraded Chime (Warning)
            </Button>
            <Button
              size="small"
              style={{ color: '#16a34a', borderColor: '#16a34a' }}
              icon={<CheckCircleOutlined />}
              onClick={() => handleSoundTest('success')}
            >
              Test Recovery Chord (Success)
            </Button>
          </Space>
        </div>
      </Card>

      {/* In-App Alerts & Notifications */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellOutlined style={{ color: '#0958d9' }} />
            <span>In-App Alert Notifications</span>
          </div>
        }
        style={{ borderRadius: 12, marginBottom: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Display Floating Toast Notifications</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Show Ant Design alert notifications on the top-right screen when API health transitions occur.
            </div>
          </div>
          <Switch
            checked={prefs.inAppAlertsEnabled}
            onChange={(checked) => dispatch(setPreferences({ inAppAlertsEnabled: checked }))}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
            Intelligent Deduplication & Health Transition Rules
          </h4>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div>• <b>Ongoing Incident Deduplication:</b> API Pulse suppresses repetitive alerts for the same continuous incident within a 15-minute sliding window to prevent notification flood.</div>
            <div style={{ marginTop: 4 }}>• <b>Degradation Thresholds:</b> Triggered when response time exceeds endpoint threshold (default 500ms) or when high error rates occur.</div>
            <div style={{ marginTop: 4 }}>• <b>Automatic Recovery:</b> When an endpoint returns HTTP 2xx and normal latency, active alerts auto-resolve and a recovery notification is generated.</div>
          </div>
        </div>
      </Card>

      {/* External Channels */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamOutlined style={{ color: '#0958d9' }} />
            <span>Notification Channels</span>
          </div>
        }
        style={{ borderRadius: 12 }}
      >
        {NOTIFICATION_CHANNELS.map(c => (
          <div
            key={c.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontWeight: 500, fontSize: 14 }}>{c.label}</span>
            <Switch defaultChecked={c.defaultChecked} />
          </div>
        ))}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// API Keys Tab
// ---------------------------------------------------------------------------
const ApiKeysTab: React.FC = () => {
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [keys, setKeys]             = useState<ApiKey[]>(MOCK_API_KEYS);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => null);
    message.success('API key copied to clipboard');
  };

  const handleRevoke = (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id));
    message.success('API key revoked');
  };

  const handleCreate = () => {
    const newKey: ApiKey = {
      id:        `k${Date.now()}`,
      name:      'New Key',
      key:       `pi_sk_new_${Math.random().toString(36).slice(2, 10)}...xxxx`,
      createdAt: new Date().toISOString(),
      lastUsed:  new Date().toISOString(),
      scopes:    ['read'],
    };
    setKeys(prev => [newKey, ...prev]);
    message.success('New API key created');
  };

  const columns: ColumnsType<ApiKey> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => (
        <span style={{ fontWeight: 500 }}>{v}</span>
      ),
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (k: string, r: ApiKey) => (
        <Space>
          <code
            style={{
              fontSize: 12,
              background: '#f1f5f9',
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: visibleKey === r.id ? 0 : 2,
            }}
          >
            {visibleKey === r.id ? k : '•••••••••••••••••••••••'}
          </code>
          <Button
            type="text"
            size="small"
            icon={
              visibleKey === r.id ? <EyeInvisibleOutlined /> : <EyeOutlined />
            }
            onClick={() =>
              setVisibleKey(visibleKey === r.id ? null : r.id)
            }
          />
          <Tooltip title="Copy key">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(k)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Scopes',
      dataIndex: 'scopes',
      key: 'scopes',
      render: (s: string[]) => (
        <Space size={4}>
          {s.map(x => (
            <Tag key={x} style={{ fontSize: 10 }}>
              {x}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'created',
      render: (v: string) => (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(v)}</span>
      ),
    },
    {
      title: 'Last Used',
      dataIndex: 'lastUsed',
      key: 'used',
      render: (v: string) => (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(v)}</span>
      ),
    },
    {
      title: '',
      key: 'action',
      render: (_: unknown, r: ApiKey) => (
        <Tooltip title="Revoke key">
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRevoke(r.id)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      style={{ borderRadius: 12 }}
      title={
        <span style={{ fontWeight: 600, fontSize: 15 }}>API Keys</span>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={handleCreate}
          style={{ borderRadius: 6 }}
        >
          Create Key
        </Button>
      }
    >
      <Table<ApiKey>
        dataSource={keys}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        scroll={{ x: 700 }}
      />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your account, notifications, and API access"
      />

      <Tabs
        defaultActiveKey="profile"
        items={[
          {
            key: 'profile',
            label: (
              <span>
                <UserOutlined /> Profile
              </span>
            ),
            children: <ProfileTab />,
          },
          {
            key: 'notifications',
            label: (
              <span>
                <BellOutlined /> Notifications
              </span>
            ),
            children: <NotificationsTab />,
          },
          {
            key: 'apikeys',
            label: (
              <span>
                <KeyOutlined /> API Keys
              </span>
            ),
            children: <ApiKeysTab />,
          },
          {
            key: 'team',
            label: (
              <span>
                <TeamOutlined /> Team
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12, maxWidth: 600 }}>
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 14,
                  }}
                >
                  <TeamOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                  Team management coming soon. Invite colleagues and manage roles here.
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
