import React from 'react';
import { Layout, Space, Avatar, Dropdown, Button, Input, Tag } from 'antd';
import {
  SearchOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { logoutThunk } from '@/features/auth/authSlice';
import { toggleMobileDrawer } from '@/features/ui/uiSlice';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;

export const Header: React.FC = () => {
  const navigate     = useNavigate();
  const dispatch     = useAppDispatch();
  const { isMobile } = useResponsive();
  const { isDark }   = useTheme();
  const user         = useAppSelector(s => s.auth.user);
  const collapsed    = useAppSelector(s => s.ui.sidebarCollapsed);

  const handleLogout = async () => {
    await dispatch(logoutThunk());
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile & Account',
      onClick: () => navigate('/settings'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'System Settings',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <AntHeader style={{
      position: 'fixed',
      top: 0,
      right: 0,
      left: sidebarWidth,
      zIndex: 99,
      background: isDark ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: isDark ? '1px solid #1f293d' : '1px solid rgba(226, 232, 240, 0.8)',
      padding: isMobile ? '0 16px' : '0 28px',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      gap: 16,
    }}>
      {/* Left section: Hamburger (mobile only) + Search Bar with keyboard shortcut */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 460 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            onClick={() => dispatch(toggleMobileDrawer())}
            style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
        )}
        <Input
          prefix={<SearchOutlined style={{ color: isDark ? '#a1a1aa' : '#71717a', fontSize: 15, marginRight: 4 }} />}
          suffix={
            !isMobile ? (
              <Tag
                bordered={false}
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  background: isDark ? '#27272a' : '#e4e4e7',
                  color: isDark ? '#f4f4f5' : '#09090b',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontFamily: 'monospace',
                }}
              >
                ⌘K
              </Tag>
            ) : null
          }
          placeholder={isMobile ? "Search..." : "Quick search endpoints, projects, telemetry…"}
          variant="filled"
          style={{
            width: '100%',
            maxWidth: 360,
            borderRadius: 10,
            background: isDark ? '#18181b' : '#f4f4f5',
            border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
            height: 38,
            color: 'var(--color-text)',
          }}
        />
      </div>

      {/* Right side: Theme Selector + Notification Center + User Profile */}
      <Space size={isMobile ? 8 : 14} style={{ display: 'flex', alignItems: 'center' }}>
        {/* Three Mode Capsule Pill Theme Selector (Light, Dark, System) */}
        <ThemeSelector variant="pill" size={isMobile ? 'small' : 'middle'} />

        {/* Real-time Notification Center */}
        <NotificationCenter />

        {/* User Menu Pill */}
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '4px 10px 4px 6px',
              borderRadius: 24,
              border: isDark ? '1px solid #1f293d' : '1px solid rgba(226, 232, 240, 0.8)',
              background: isDark ? '#161f30' : '#ffffff',
              boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.15s ease',
            }}
          >
            <Avatar
              size={30}
              src={user?.avatar}
              style={{
                background: isDark ? '#27272a' : '#18181b',
                fontSize: 13,
                fontWeight: 700,
                color: '#ffffff',
                border: isDark ? '1px solid #3f3f46' : '1px solid #27272a',
                flexShrink: 0,
              }}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </Avatar>
            {!isMobile && (
              <div style={{ lineHeight: 1.25, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                  {user?.name ?? 'Developer'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  {user?.role ?? 'admin'}
                </div>
              </div>
            )}
          </div>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};
