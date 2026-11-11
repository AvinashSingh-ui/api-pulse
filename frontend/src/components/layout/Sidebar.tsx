import React from 'react';
import { Layout, Badge, Tooltip, Drawer } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DashboardOutlined,
  FolderOutlined,
  ApiOutlined,
  MonitorOutlined,
  BugOutlined,
  FileTextOutlined,
  BellOutlined,
  RobotOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { toggleSidebar, setMobileDrawerOpen } from '@/features/ui/uiSlice';
import { useResponsive } from '@/hooks/useResponsive';

const { Sider } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  path: string;
}

export const Sidebar: React.FC = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const dispatch  = useAppDispatch();
  const { isMobile } = useResponsive();
  const collapsed = useAppSelector(s => s.ui.sidebarCollapsed);
  const mobileDrawerOpen = useAppSelector(s => s.ui.mobileDrawerOpen);
  const activeAlerts = useAppSelector(s => s.alerts.activeCount);

  const navItems: NavItem[] = [
    { key: '/',            label: 'Dashboard',   icon: <DashboardOutlined />, path: '/'            },
    { key: '/projects',    label: 'Projects',    icon: <FolderOutlined />,    path: '/projects'    },
    { key: '/endpoints',   label: 'Endpoints',   icon: <ApiOutlined />,       path: '/endpoints'   },
    { key: '/monitoring',  label: 'Monitoring',  icon: <MonitorOutlined />,   path: '/monitoring'  },
    { key: '/testing',     label: 'Testing',     icon: <BugOutlined />,       path: '/testing'     },
    { key: '/logs',        label: 'Logs',        icon: <FileTextOutlined />,  path: '/logs'        },
    { key: '/alerts',      label: 'Alerts',      icon: <BellOutlined />,      path: '/alerts', badge: activeAlerts },
    { key: '/ai-analysis', label: 'AI Analysis', icon: <RobotOutlined />,     path: '/ai-analysis' },
  ];

  const selectedKey = navItems.find(n =>
    n.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(n.path)
  )?.key ?? '/';

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      dispatch(setMobileDrawerOpen(false));
    }
  };

  const renderNavContent = (isDrawer = false) => {
    const isCollapsedMode = !isDrawer && collapsed;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f172a',
        overflow: 'hidden',
      }}>
        {/* Brand / Logo */}
        <div style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isDrawer ? 'space-between' : 'flex-start',
          padding: isCollapsedMode ? '0 16px' : '0 20px',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #4f8ef7 0%, #7c5cfc 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
            }}>
              AP
            </div>
            {(!isCollapsedMode || isDrawer) && (
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>API Pulse</div>
                <div style={{ color: '#64748b', fontSize: 10, letterSpacing: '0.08em' }}>API MONITORING</div>
              </div>
            )}
          </div>
          {isDrawer && (
            <div
              onClick={() => dispatch(setMobileDrawerOpen(false))}
              style={{ color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            >
              <CloseOutlined style={{ fontSize: 16 }} />
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 0' }}>
          {navItems.map(item => {
            const isActive = selectedKey === item.key;
            const content = (
              <div
                key={item.key}
                onClick={() => handleNavClick(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsedMode ? '10px 0' : '10px 16px',
                  margin: '2px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(79,142,247,0.15)' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s ease',
                  justifyContent: isCollapsedMode ? 'center' : 'flex-start',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                    (e.currentTarget as HTMLElement).style.color = '#fff';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  }
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: -8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 20,
                    background: '#4f8ef7',
                    borderRadius: '0 2px 2px 0',
                  }} />
                )}
                <span style={{ fontSize: 16, display: 'flex', alignItems: 'center' }}>
                  {item.badge ? (
                    <Badge count={item.badge} size="small" offset={[4, -2]}>
                      {item.icon}
                    </Badge>
                  ) : item.icon}
                </span>
                {(!isCollapsedMode || isDrawer) && <span>{item.label}</span>}
              </div>
            );

            return isCollapsedMode ? (
              <Tooltip key={item.key} title={item.label} placement="right">
                {content}
              </Tooltip>
            ) : content;
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {(() => {
            const isActive = location.pathname === '/settings';
            const btn = (
              <div
                onClick={() => handleNavClick('/settings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsedMode ? '10px 0' : '10px 16px',
                  margin: '2px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(79,142,247,0.15)' : 'transparent',
                  color: isActive ? '#fff' : '#94a3b8',
                  fontSize: 14,
                  justifyContent: isCollapsedMode ? 'center' : 'flex-start',
                }}
              >
                <SettingOutlined style={{ fontSize: 16 }} />
                {(!isCollapsedMode || isDrawer) && <span>Settings</span>}
              </div>
            );
            return isCollapsedMode ? <Tooltip title="Settings" placement="right">{btn}</Tooltip> : btn;
          })()}

          {!isDrawer && (
            <div
              onClick={() => dispatch(toggleSidebar())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: isCollapsedMode ? '10px 0' : '10px 16px',
                margin: '2px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#64748b',
                fontSize: 14,
                justifyContent: isCollapsedMode ? 'center' : 'flex-start',
              }}
            >
              {collapsed ? <MenuUnfoldOutlined style={{ fontSize: 16 }} /> : (
                <>
                  <MenuFoldOutlined style={{ fontSize: 16 }} />
                  <span>Collapse</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <Drawer
        placement="left"
        closable={false}
        open={mobileDrawerOpen}
        onClose={() => dispatch(setMobileDrawerOpen(false))}
        width={260}
        styles={{ body: { padding: 0, background: '#0f172a' } }}
      >
        {renderNavContent(true)}
      </Drawer>
    );
  }

  return (
    <Sider
      collapsed={collapsed}
      collapsedWidth={64}
      width={240}
      style={{
        background: '#0f172a',
        position: 'fixed',
        height: '100vh',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}
    >
      {renderNavContent(false)}
    </Sider>
  );
};
