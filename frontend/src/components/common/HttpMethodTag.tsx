import React from 'react';
import type { HttpMethod } from '@/types';

interface HttpMethodTagProps {
  method: HttpMethod;
  size?: 'sm' | 'md';
}

export const HttpMethodTag: React.FC<HttpMethodTagProps> = ({ method, size = 'md' }) => {
  const methodClass = `method-pill-${(method || 'get').toLowerCase()}`;
  return (
    <span
      className={methodClass}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        borderRadius: 5,
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 700,
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.03em',
        minWidth: size === 'sm' ? 44 : 52,
        textAlign: 'center',
      }}
    >
      {method}
    </span>
  );
};

