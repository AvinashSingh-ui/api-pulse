import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, Alert, Divider, Tabs, Select, message } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { loginThunk, registerThunk, clearError } from '@/features/auth/authSlice';
import { useResponsive } from '@/hooks/useResponsive';
import type { LoginCredentials, RegisterCredentials } from '@/types';

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useResponsive();
  const { isLoading, error, isAuthenticated } = useAppSelector(s => s.auth);

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
    return () => { dispatch(clearError()); };
  }, [isAuthenticated, navigate, dispatch]);

  // Handle Login
  const handleLoginSubmit = async (values: LoginCredentials & { remember: boolean }) => {
    setSuccessMsg(null);
    const result = await dispatch(loginThunk({ email: values.email, password: values.password }));
    if (loginThunk.fulfilled.match(result)) {
      message.success('Welcome back to API Pulse!');
      navigate('/', { replace: true });
    }
  };

  // Handle Registration
  const handleRegisterSubmit = async (values: RegisterCredentials) => {
    setSuccessMsg(null);
    const result = await dispatch(registerThunk({
      name: values.name,
      email: values.email,
      password: values.password,
      role: values.role || 'developer',
    }));

    if (registerThunk.fulfilled.match(result)) {
      message.success('Account successfully registered in Database!');
      setSuccessMsg(`Account for "${values.email}" created! Please enter your password to sign in.`);
      // Auto pre-fill login form and switch to login tab
      loginForm.setFieldsValue({ email: values.email });
      setActiveTab('login');
      registerForm.resetFields();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: isTablet ? 'column' : 'row',
      minHeight: '100vh',
      background: '#fff',
    }}>
      {/* Left – branding hero */}
      <div style={{
        flex: isTablet ? 'none' : 1,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2044 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: isMobile ? '36px 20px' : isTablet ? '48px 36px' : '60px 64px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(79,142,247,0.08)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'rgba(124,92,252,0.08)',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 24 : 48 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #4f8ef7, #7c5cfc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>
            AP
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>API Pulse</div>
            <div style={{ color: '#64748b', fontSize: 10, letterSpacing: '0.1em' }}>
              INTELLIGENT API MONITORING
            </div>
          </div>
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: isMobile ? 26 : 34,
          fontWeight: 700,
          lineHeight: 1.3,
          marginBottom: 12,
          maxWidth: 480,
        }}>
          Monitor your APIs with{' '}
          <span style={{ color: '#4f8ef7' }}>intelligent insights</span>
        </h1>
        <p style={{
          color: '#94a3b8',
          fontSize: isMobile ? 14 : 16,
          lineHeight: 1.6,
          marginBottom: isTablet ? 20 : 40,
          maxWidth: 440,
        }}>
          Real-time monitoring, AI-powered anomaly detection, and instant alerts — all stored in your production database.
        </p>

        {!isMobile && (
          [
            'Real-time uptime & performance tracking',
            'AI-driven root cause analysis with confidence levels',
            'PostgreSQL & SQLite relational database storage',
            'Automated assertion testing and instant pings',
          ].map((feature, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(79,142,247,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#4f8ef7', fontSize: 12, fontWeight: 700,
              }}>✓</div>
              <span style={{ color: '#cbd5e1', fontSize: 14 }}>{feature}</span>
            </div>
          ))
        )}
      </div>

      {/* Right – Auth Card (Sign In / Sign Up) */}
      <div style={{
        flex: isTablet ? 'none' : '0 0 520px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: isMobile ? '36px 20px' : '48px 48px',
        background: '#fff',
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            {activeTab === 'login' ? 'Sign in to API Pulse' : 'Create an Account'}
          </h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {activeTab === 'login'
              ? 'Enter your registered credentials to access the monitoring console'
              : 'Register your details to save your user record into the database'}
          </p>
        </div>

        {/* Tab Switcher */}
        <Tabs
          activeKey={activeTab}
          onChange={(k) => {
            setActiveTab(k as 'login' | 'register');
            dispatch(clearError());
            setSuccessMsg(null);
          }}
          items={[
            { key: 'login', label: <span style={{ fontWeight: 600 }}>Sign In</span> },
            { key: 'register', label: <span style={{ fontWeight: 600 }}>Create Account (Sign Up)</span> },
          ]}
          style={{ marginBottom: 16 }}
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
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {error && (
          <Alert
            message="Authentication Error"
            description={
              <div>
                <span>{error}</span>
                {error.toLowerCase().includes('register') && (
                  <div style={{ marginTop: 6 }}>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() => setActiveTab('register')}
                    >
                      👉 Click here to register your account now
                    </Button>
                  </div>
                )}
              </div>
            }
            type="error"
            showIcon
            closable
            onClose={() => dispatch(clearError())}
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {/* Form 1: SIGN IN FORM */}
        {activeTab === 'login' && (
          <Form
            form={loginForm}
            layout="vertical"
            onFinish={handleLoginSubmit}
            initialValues={{ remember: true }}
            size="large"
          >
            <Form.Item
              name="email"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Registered Email</span>}
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="you@example.com"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Password</span>}
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Your password"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>Remember me</Checkbox>
                </Form.Item>
                <Button
                  type="link"
                  style={{ padding: 0, color: '#4f8ef7', fontSize: 13 }}
                  onClick={() => setActiveTab('register')}
                >
                  New here? Register account
                </Button>
              </div>
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                style={{ height: 44, borderRadius: 8, fontSize: 15, fontWeight: 600 }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* Form 2: SIGN UP / REGISTRATION FORM */}
        {activeTab === 'register' && (
          <Form
            form={registerForm}
            layout="vertical"
            onFinish={handleRegisterSubmit}
            initialValues={{ role: 'developer' }}
            size="large"
          >
            <Form.Item
              name="name"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Full Name</span>}
              rules={[{ required: true, message: 'Please enter your full name' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="e.g. John Doe"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Work Email</span>}
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="john@example.com"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Create Password</span>}
              rules={[
                { required: true, message: 'Please choose a password' },
                { min: 4, message: 'Password must be at least 4 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Minimum 4 characters"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="role"
              label={<span style={{ fontWeight: 500, color: '#374151' }}>Assigned Team Role</span>}
            >
              <Select
                options={[
                  { label: 'Developer (Monitor & Run Checks)', value: 'developer' },
                  { label: 'Admin (Full Access & Configuration)', value: 'admin' },
                  { label: 'Viewer (Read-only Dashboard)', value: 'viewer' },
                ]}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                style={{ height: 44, borderRadius: 8, fontSize: 15, fontWeight: 600, background: '#22c55e', borderColor: '#22c55e' }}
              >
                Register & Save to Database
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
              Already registered?{' '}
              <a onClick={() => setActiveTab('login')} style={{ color: '#4f8ef7', fontWeight: 600 }}>
                Sign in directly
              </a>
            </div>
          </Form>
        )}

        <div style={{
          marginTop: 24,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          fontSize: 12,
          color: '#64748b',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <SafetyOutlined style={{ color: '#22c55e' }} />
          <span>Real-time authentication with SQL database storage & bcrypt encryption</span>
        </div>
      </div>
    </div>
  );
}
