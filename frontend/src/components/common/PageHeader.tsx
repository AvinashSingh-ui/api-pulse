import React from 'react';
import { Breadcrumb, Space } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  extra,
}) => (
  <div style={{ marginBottom: 20 }}>
    {breadcrumbs.length > 0 && (
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          {
            title: (
              <Link to="/">
                <HomeOutlined />
              </Link>
            ),
          },
          ...breadcrumbs.map((b) => ({
            title: b.path ? <Link to={b.path}>{b.label}</Link> : b.label,
          })),
        ]}
      />
    )}
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <div style={{ minWidth: 200, flex: 1 }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#0f172a',
          margin: 0,
          lineHeight: 1.3,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: '#64748b', marginTop: 4, marginBottom: 0, fontSize: 13 }}>
            {subtitle}
          </p>
        )}
      </div>
      <Space wrap size={8}>
        {extra}
        {actions}
      </Space>
    </div>
  </div>
);
