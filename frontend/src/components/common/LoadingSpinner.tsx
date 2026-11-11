import React from 'react';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface LoadingSpinnerProps {
  size?: 'small' | 'default' | 'large';
  fullPage?: boolean;
  tip?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'default',
  fullPage = false,
  tip,
}) => {
  const spinner = (
    <Spin
      indicator={<LoadingOutlined style={{ fontSize: size === 'large' ? 36 : size === 'small' ? 16 : 24 }} spin />}
      size={size}
      tip={tip}
    />
  );

  if (fullPage) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        gap: 16,
      }}>
        {spinner}
      </div>
    );
  }

  return spinner;
};
