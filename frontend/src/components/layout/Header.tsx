import React from 'react';
import { Layout, Space, Avatar, Dropdown, Badge, Button, Input } from 'antd';
import {
  BellOutlined, SearchOutlined, LogoutOutlined,
  UserOutlined, SettingOutlined, MenuOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { logoutThunk } from '@/features/auth/authSlice';
import { toggleMobileDrawer } from '@/features/ui/uiSlice';
import { useResponsive } from '@/hooks/useResponsive';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;

export const Header: React.FC = () => {
  const navigate     = useNavigate();
  const dispatch     = useAppDispatch();
  const { isMobile } = useResponsive();
  const user         = useAppSelector(s => s.auth.user);
  const collapsed    = useAppSelector(s => s.ui.sidebarCollapsed);
  const activeAlerts = useAppSelector(s => s.alerts.activeCount);

  const handleLogout = async () => {
    await dispatch(logoutThunk());
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/settings'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
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
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: isMobile ? '0 12px' : '0 24px',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'left 0.2s ease',
      gap: 12,
    }}>
      {/* Left section: Hamburger (mobile only) + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 420 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            onClick={() => dispatch(toggleMobileDrawer())}
            style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
        )}
        <Input
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder={isMobile ? "Search..." : "Search endpoints, projects, logs…"}
          variant="filled"
          style={{ width: '100%', maxWidth: 300, borderRadius: 8 }}
          size="middle"
        />
      </div>

      {/* Right side: Alerts + Profile */}
      <Space size={isMobile ? 6 : 12}>
        {/* Alerts bell */}
        <Badge count={activeAlerts} size="small">
          <Button
            type="text"
            icon={<BellOutlined style={{ fontSize: 18 }} />}
            onClick={() => navigate('/alerts')}
            style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
        </Badge>

        {/* User menu */}
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 8,
            transition: 'background 0.15s',
          }}>
            <Avatar
              size={32}
              src={user?.avatar}
              style={{ background: '#4f8ef7', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </Avatar>
            {!isMobile && (
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {user?.name ?? 'Developer'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
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
