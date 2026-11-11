import React from 'react';
import type { HttpMethod } from '@/types';

const METHOD_STYLES: Record<HttpMethod, { bg: string; color: string }> = {
  GET:     { bg: '#dcfce7', color: '#16a34a' },
  POST:    { bg: '#dbeafe', color: '#1d4ed8' },
  PUT:     { bg: '#fef3c7', color: '#d97706' },
  PATCH:   { bg: '#ede9fe', color: '#7c3aed' },
  DELETE:  { bg: '#fee2e2', color: '#dc2626' },
  HEAD:    { bg: '#f1f5f9', color: '#475569' },
  OPTIONS: { bg: '#f1f5f9', color: '#94a3b8' },
};

interface HttpMethodTagProps {
  method: HttpMethod;
  size?: 'sm' | 'md';
}

export const HttpMethodTag: React.FC<HttpMethodTagProps> = ({ method, size = 'md' }) => {
  const style = METHOD_STYLES[method] ?? { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: size === 'sm' ? '1px 6px' : '2px 8px',
      borderRadius: 4,
      fontSize: size === 'sm' ? 10 : 11,
      fontWeight: 700,
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '0.03em',
      background: style.bg,
      color: style.color,
    }}>
      {method}
    </span>
  );
};

