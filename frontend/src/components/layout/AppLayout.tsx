import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header }  from './Header';
import { NotificationNotifier } from '@/components/notifications/NotificationNotifier';
import { useAppSelector } from '@/app/hooks';
import { useResponsive } from '@/hooks/useResponsive';

const { Content } = Layout;

export const AppLayout: React.FC = () => {
  const collapsed = useAppSelector(s => s.ui.sidebarCollapsed);
  const { isMobile } = useResponsive();
  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <NotificationNotifier />
      <Sidebar />
      <Layout style={{ marginLeft: sidebarWidth, transition: 'margin-left 0.2s ease' }}>
        <Header />
        <Content style={{
          marginTop: 60,
          padding: isMobile ? '16px 12px' : '24px',
          minHeight: 'calc(100vh - 60px)',
          background: '#f5f7fa',
          overflowX: 'hidden',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
