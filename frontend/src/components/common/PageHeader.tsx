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
  <div style={{ marginBottom: 24 }}>
    {breadcrumbs.length > 0 && (
      <Breadcrumb
        style={{ marginBottom: 10, fontSize: 13 }}
        items={[
          {
            title: (
              <Link to="/" style={{ color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center' }}>
                <HomeOutlined style={{ fontSize: 13 }} />
              </Link>
            ),
          },
          ...breadcrumbs.map((b) => ({
            title: b.path ? (
              <Link to={b.path} style={{ color: 'var(--color-text-secondary)' }}>{b.label}</Link>
            ) : (
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{b.label}</span>
            ),
          })),
        ]}
      />
    )}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <div style={{ minWidth: 220, flex: 1 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--color-text)',
            margin: 0,
            lineHeight: 1.25,
            letterSpacing: '-0.025em',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              color: 'var(--color-text-secondary)',
              marginTop: 4,
              marginBottom: 0,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <Space wrap size={10} style={{ display: 'flex', alignItems: 'center' }}>
        {extra}
        {actions}
      </Space>
    </div>
  </div>
);
