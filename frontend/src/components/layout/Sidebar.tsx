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
        background: '#090d16',
        overflow: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Brand / Logo */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isDrawer ? 'space-between' : 'flex-start',
          padding: isCollapsedMode ? '0 16px' : '0 20px',
          gap: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexShrink: 0,
        }}>
          <div
            onClick={() => handleNavClick('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: '#ffffff',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.45)',
              position: 'relative',
            }}>
              AP
              <span
                className="live-dot-pulse"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 7,
                  height: 7,
                }}
              />
            </div>
            {(!isCollapsedMode || isDrawer) && (
              <div>
                <div style={{
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 15,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                }}>
                  API Pulse
                </div>
                <div style={{
                  color: '#64748b',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}>
                  Telemetry SaaS
                </div>
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
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 8px' }}>
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
                  padding: isCollapsedMode ? '10px 0' : '10px 14px',
                  marginBottom: 4,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(79, 70, 229, 0.22) 0%, rgba(99, 102, 241, 0.08) 100%)'
                    : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  justifyContent: isCollapsedMode ? 'center' : 'flex-start',
                  position: 'relative',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                  boxShadow: isActive ? 'inset 3px 0 0 #6366f1' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
                    (e.currentTarget as HTMLElement).style.color = '#ffffff';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  }
                }}
              >
                <span style={{ fontSize: 16, display: 'flex', alignItems: 'center' }}>
                  {item.badge ? (
                    <Badge count={item.badge} size="small" offset={[4, -2]}>
                      {item.icon}
                    </Badge>
                  ) : item.icon}
                </span>
                {(!isCollapsedMode || isDrawer) && (
                  <span style={{ letterSpacing: '-0.01em' }}>{item.label}</span>
                )}
              </div>
            );

            return isCollapsedMode ? (
              <Tooltip key={item.key} title={item.label} placement="right">
                {content}
              </Tooltip>
            ) : content;
          })}
        </div>

        {/* Footer Settings & Collapse */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {(() => {
            const isActive = location.pathname === '/settings';
            const btn = (
              <div
                onClick={() => handleNavClick('/settings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsedMode ? '10px 0' : '10px 14px',
                  marginBottom: 4,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(79, 70, 229, 0.22)' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  justifyContent: isCollapsedMode ? 'center' : 'flex-start',
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
                    (e.currentTarget as HTMLElement).style.color = '#ffffff';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  }
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
                padding: isCollapsedMode ? '10px 0' : '10px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                color: '#64748b',
                fontSize: 14,
                fontWeight: 500,
                justifyContent: isCollapsedMode ? 'center' : 'flex-start',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#ffffff';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.04)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = '#64748b';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
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
        styles={{ body: { padding: 0, background: '#090d16' } }}
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
        background: '#090d16',
        position: 'fixed',
        height: '100vh',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        overflow: 'hidden',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {renderNavContent(false)}
    </Sider>
  );
};
