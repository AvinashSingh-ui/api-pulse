import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, Alert, Tabs, Select, Modal, Space, Typography, message } from 'antd';
import {
  LockOutlined, MailOutlined, UserOutlined, SafetyOutlined,
  DashboardOutlined, ApiOutlined, CheckCircleOutlined,
  EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { loginThunk, registerThunk, clearError } from '@/features/auth/authSlice';
import { useResponsive } from '@/hooks/useResponsive';
import {
  loginSchema, registerSchema,
  emailSchema, loginPasswordSchema,
  registerNameSchema, registerPasswordSchema,
  createZodRule,
  type LoginFormData, type RegisterFormData,
} from './authSchemas';

const { Text, Paragraph } = Typography;

/**
 * Feature highlights displayed in the left branding panel.
 * Uses Ant Design icons exclusively and highlights the 5 core capabilities of API Pulse.
 */
const BRANDING_FEATURES = [
  {
    icon: <DashboardOutlined style={{ fontSize: 18, color: '#4f8ef7' }} />,
    title: 'Real-Time API Health & Uptime Monitoring',
    description: 'Continuous endpoint health probes with millisecond-precision response tracking.',
  },
  {
    icon: <ApiOutlined style={{ fontSize: 18, color: '#7c5cfc' }} />,
    title: 'Intelligent Performance & Latency Analysis',
    description: 'P50, P95, and P99 latency distribution analysis with traffic volume telemetry.',
  },
  {
    icon: <SafetyOutlined style={{ fontSize: 18, color: '#22c55e' }} />,
    title: 'Automated Failure Detection & Alerts',
    description: 'Immediate multi-channel alerts upon status code anomalies or threshold breaches.',
  },
  {
    icon: <CheckCircleOutlined style={{ fontSize: 18, color: '#00d4aa' }} />,
    title: 'AI-Powered Root Cause Analysis',
    description: 'Autonomous diagnostic engine identifying root causes and recommending actionable code fixes.',
  },
  {
    icon: <CheckCircleOutlined style={{ fontSize: 18, color: '#38bdf8' }} />,
    title: 'Comprehensive API Testing & Logs',
    description: 'Automated synthetic assertion test suites and live structured HTTP request logs.',
  },
];

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, isTablet } = useResponsive();
  const { isLoading, error, isAuthenticated } = useAppSelector((s) => s.auth);

  // Determine initial active tab from route or search parameters
  const isRegisterRoute = location.pathname.includes('/register') || new URLSearchParams(location.search).get('mode') === 'register';
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(isRegisterRoute ? 'register' : 'login');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
    return () => {
      dispatch(clearError());
    };
  }, [isAuthenticated, navigate, dispatch]);

  // Sync tab with URL if user clicks browser back/forward or navigates
  useEffect(() => {
    if (location.pathname.includes('/register')) {
      setActiveTab('register');
    } else if (location.pathname.includes('/login')) {
      setActiveTab('login');
    }
  }, [location.pathname]);

  // Handle Login submission with Zod validation
  const handleLoginSubmit = async (values: LoginFormData) => {
    setSuccessMsg(null);
    dispatch(clearError());

    // Defensive Zod schema parse
    const parseResult = loginSchema.safeParse(values);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues?.[0]?.message || 'Please check your login details';
      message.error(firstError);
      return;
    }

    const result = await dispatch(
      loginThunk({
        email: values.email.trim(),
        password: values.password,
      })
    );

    if (loginThunk.fulfilled.match(result)) {
      message.success('Welcome back to API Pulse!');
      navigate('/', { replace: true });
    }
  };

  // Handle Registration submission with Zod validation
  const handleRegisterSubmit = async (values: RegisterFormData) => {
    setSuccessMsg(null);
    dispatch(clearError());

    // Defensive Zod schema parse
    const parseResult = registerSchema.safeParse(values);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues?.[0]?.message || 'Please check your registration details';
      message.error(firstError);
      return;
    }

    const result = await dispatch(
      registerThunk({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role || 'developer',
      })
    );

    if (registerThunk.fulfilled.match(result)) {
      message.success('Account created successfully! Please sign in with your credentials.');
      setSuccessMsg(`Account for "${values.email}" created! Please enter your password to sign in.`);
      loginForm.setFieldsValue({ email: values.email });
      setActiveTab('login');
      registerForm.resetFields();
    }
  };

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    dispatch(clearError());
    setSuccessMsg(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isTablet ? 'column' : 'row',
        minHeight: '100vh',
        width: '100%',
        background: '#ffffff',
        overflowX: 'hidden',
      }}
    >
      {/* ── Left Branding Panel ────────────────────────────────────────────── */}
      <div
        style={{
          flex: isTablet ? 'none' : '1 1 50%',
          background: 'linear-gradient(145deg, #090e17 0%, #0f172a 45%, #131d36 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isMobile ? '36px 20px' : isTablet ? '48px 36px' : '64px 56px',
          position: 'relative',
          overflow: 'hidden',
          borderRight: isTablet ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Subtle decorative glow elements */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79, 142, 247, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -80,
            left: -80,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124, 92, 252, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Brand Logo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isMobile ? 24 : 36 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #4f8ef7 0%, #7c5cfc 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(79, 142, 247, 0.35)',
              flexShrink: 0,
            }}
          >
            <ApiOutlined style={{ fontSize: 22, color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>
              API Pulse
            </div>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>
              INTELLIGENT OBSERVABILITY
            </div>
          </div>
        </div>

        {/* Main Brand Heading */}
        <h1
          style={{
            color: '#ffffff',
            fontSize: isMobile ? 26 : 34,
            fontWeight: 800,
            lineHeight: 1.25,
            marginBottom: 14,
            maxWidth: 520,
            letterSpacing: '-0.02em',
          }}
        >
          Take Control of Your{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #4f8ef7 0%, #00d4aa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            API Performance
          </span>
        </h1>

        {/* Professional Supporting Description */}
        <p
          style={{
            color: '#94a3b8',
            fontSize: isMobile ? 14 : 15,
            lineHeight: 1.6,
            marginBottom: isMobile ? 24 : 36,
            maxWidth: 500,
          }}
        >
          Enterprise-grade observability, real-time health telemetry, and autonomous AI diagnostics
          engineered to keep your microservices fast, resilient, and reliable.
        </p>

        {/* 5 Core Feature Highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          {BRANDING_FEATURES.map((feat, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {feat.icon}
              </div>
              <div>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>
                  {feat.title}
                </div>
                <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                  {feat.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Authentication Panel ─────────────────────────────────────── */}
      <div
        style={{
          flex: isTablet ? 'none' : '1 1 50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '32px 20px' : isTablet ? '48px 36px' : '64px 48px',
          background: '#ffffff',
        }}
      >
        <div style={{ width: '100%', maxWidth: 460 }}>
          {/* Form Header */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              {activeTab === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              {activeTab === 'login'
                ? 'Sign in to access your API monitoring dashboard.'
                : 'Sign up to begin monitoring your API endpoints and services.'}
            </p>
          </div>

          {/* Tab Switcher: Sign In vs Sign Up */}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => switchTab(key as 'login' | 'register')}
            items={[
              { key: 'login', label: <span style={{ fontWeight: 600, fontSize: 14 }}>Sign In</span> },
              { key: 'register', label: <span style={{ fontWeight: 600, fontSize: 14 }}>Create Account</span> },
            ]}
            style={{ marginBottom: 20 }}
          />

          {/* Feedback Alerts */}
          {successMsg && (
            <Alert
              message="Registration Successful"
              description={successMsg}
              type="success"
              showIcon
              closable
              onClose={() => setSuccessMsg(null)}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          {error && (
            <Alert
              message="Authentication Error"
              description={
                <div>
                  <span>{error}</span>
                  {error.toLowerCase().includes('register') || error.toLowerCase().includes('sign up') ? (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontWeight: 600 }}
                        onClick={() => switchTab('register')}
                      >
                        👉 Click here to create an account now
                      </Button>
                    </div>
                  ) : null}
                </div>
              }
              type="error"
              showIcon
              closable
              onClose={() => dispatch(clearError())}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          {/* ── Form 1: SIGN IN ──────────────────────────────────────────────── */}
          {activeTab === 'login' && (
            <Form
              form={loginForm}
              layout="vertical"
              onFinish={handleLoginSubmit}
              initialValues={{ remember: true }}
              size="large"
              requiredMark={false}
            >
              {/* Email Address */}
              <Form.Item
                name="email"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Email Address</span>}
                rules={[createZodRule(emailSchema)]}
                style={{ marginBottom: 18 }}
              >
                <Input
                  prefix={<MailOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={{ borderRadius: 8 }}
                />
              </Form.Item>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: -12, marginBottom: 16 }}>
                Enter the email address associated with your account.
              </div>

              {/* Password */}
              <Form.Item
                name="password"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Password</span>}
                rules={[createZodRule(loginPasswordSchema)]}
                style={{ marginBottom: 16 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{ borderRadius: 8 }}
                  iconRender={(visible) =>
                    visible ? <EyeOutlined style={{ color: '#64748b' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />
                  }
                />
              </Form.Item>

              {/* Remember Me & Forgot Password Row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 22,
                }}
              >
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox style={{ fontSize: 13, color: '#475569' }}>Remember me</Checkbox>
                </Form.Item>
                <Button
                  type="link"
                  onClick={() => setIsForgotModalOpen(true)}
                  style={{ padding: 0, fontSize: 13, color: '#4f8ef7', fontWeight: 500 }}
                >
                  Forgot password?
                </Button>
              </div>

              {/* Sign In Submit Button */}
              <Form.Item style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isLoading}
                  disabled={isLoading}
                  block
                  style={{
                    height: 44,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(79, 142, 247, 0.25)',
                  }}
                >
                  Sign In
                </Button>
              </Form.Item>

              {/* Registration Link */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>Don't have an account? </span>
                <Button
                  type="link"
                  onClick={() => switchTab('register')}
                  style={{ padding: 0, fontSize: 13, fontWeight: 600, color: '#4f8ef7' }}
                >
                  Sign up
                </Button>
              </div>
            </Form>
          )}

          {/* ── Form 2: CREATE ACCOUNT (REGISTRATION) ────────────────────────── */}
          {activeTab === 'register' && (
            <Form
              form={registerForm}
              layout="vertical"
              onFinish={handleRegisterSubmit}
              initialValues={{ role: 'developer' }}
              size="large"
              requiredMark={false}
            >
              {/* Full Name */}
              <Form.Item
                name="name"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Full Name</span>}
                rules={[createZodRule(registerNameSchema)]}
                style={{ marginBottom: 18 }}
              >
                <Input
                  prefix={<UserOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="e.g. John Doe"
                  autoComplete="name"
                  style={{ borderRadius: 8 }}
                />
              </Form.Item>

              {/* Work Email */}
              <Form.Item
                name="email"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Email Address</span>}
                rules={[createZodRule(emailSchema)]}
                style={{ marginBottom: 18 }}
              >
                <Input
                  prefix={<MailOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={{ borderRadius: 8 }}
                />
              </Form.Item>

              {/* Create Password */}
              <Form.Item
                name="password"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Password</span>}
                rules={[createZodRule(registerPasswordSchema)]}
                style={{ marginBottom: 6 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="Minimum 8 characters (letters & numbers)"
                  autoComplete="new-password"
                  style={{ borderRadius: 8 }}
                  iconRender={(visible) =>
                    visible ? <EyeOutlined style={{ color: '#64748b' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />
                  }
                />
              </Form.Item>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 18 }}>
                Must be at least 8 characters with at least one letter and one number.
              </div>

              {/* Confirm Password */}
              <Form.Item
                name="confirmPassword"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Confirm Password</span>}
                dependencies={['password']}
                rules={[
                  {
                    validator: async (_, value) => {
                      if (!value) {
                        return Promise.reject(new Error('Please confirm your password'));
                      }
                      if (value !== registerForm.getFieldValue('password')) {
                        return Promise.reject(new Error('Passwords do not match'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
                style={{ marginBottom: 18 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  style={{ borderRadius: 8 }}
                  iconRender={(visible) =>
                    visible ? <EyeOutlined style={{ color: '#64748b' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />
                  }
                />
              </Form.Item>

              {/* Team Role */}
              <Form.Item
                name="role"
                label={<span style={{ fontWeight: 600, color: '#334155' }}>Assigned Team Role</span>}
                style={{ marginBottom: 22 }}
              >
                <Select
                  options={[
                    { label: 'Developer (Monitor endpoints & run checks)', value: 'developer' },
                    { label: 'Admin (Full access & project configuration)', value: 'admin' },
                    { label: 'Viewer (Read-only telemetry access)', value: 'viewer' },
                  ]}
                  style={{ borderRadius: 8 }}
                />
              </Form.Item>

              {/* Create Account Submit Button */}
              <Form.Item style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isLoading}
                  disabled={isLoading}
                  block
                  style={{
                    height: 44,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    background: '#22c55e',
                    borderColor: '#22c55e',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.25)',
                  }}
                >
                  Create Account
                </Button>
              </Form.Item>

              {/* Sign In Link */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>Already have an account? </span>
                <Button
                  type="link"
                  onClick={() => switchTab('login')}
                  style={{ padding: 0, fontSize: 13, fontWeight: 600, color: '#4f8ef7' }}
                >
                  Sign in directly
                </Button>
              </div>
            </Form>
          )}

          {/* Security Assurance Badge */}
          <div
            style={{
              marginTop: 28,
              padding: '10px 14px',
              borderRadius: 8,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: 12,
              color: '#64748b',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <SafetyOutlined style={{ color: '#4f8ef7', fontSize: 14 }} />
            <span>Enterprise-grade security with 256-bit encryption & token authentication</span>
          </div>
        </div>
      </div>

      {/* ── Forgot Password Information Modal ──────────────────────────────── */}
      <Modal
        title={
          <Space>
            <LockOutlined style={{ color: '#4f8ef7' }} />
            <span>Password Recovery Information</span>
          </Space>
        }
        open={isForgotModalOpen}
        onOk={() => setIsForgotModalOpen(false)}
        onCancel={() => setIsForgotModalOpen(false)}
        okText="Understood"
        cancelButtonProps={{ style: { display: 'none' } }}
        destroyOnClose
        style={{ maxWidth: '90vw' }}
      >
        <div style={{ padding: '12px 0', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          <Paragraph>
            Self-service automated password reset is not enabled for this workspace environment.
          </Paragraph>
          <Paragraph>
            For security compliance and access control, credentials must be re-issued by your
            organization administrator or by reaching out to your API Pulse system administrator.
          </Paragraph>
          <div
            style={{
              background: '#f8fafc',
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginTop: 12,
            }}
          >
            <Text strong style={{ color: '#334155' }}>
              Support Contact:
            </Text>
            <div style={{ color: '#4f8ef7', marginTop: 4, fontFamily: 'monospace' }}>
              admin@apipulse.io
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
