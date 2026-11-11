import React from 'react';
import { Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode | {
    label: string;
    onClick: () => void;
  };
  image?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data yet',
  description = 'Nothing to show here.',
  action,
  image,
}) => {
  const renderAction = () => {
    if (!action) return null;
    if (React.isValidElement(action)) return action;
    const act = action as { label: string; onClick: () => void };
    return (
      <Button type="primary" icon={<PlusOutlined />} onClick={act.onClick}>
        {act.label}
      </Button>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
    }}>
      <Empty
        image={image ?? Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{title}</p>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>{description}</p>
          </div>
        }
      >
        {renderAction()}
      </Empty>
    </div>
  );
};
