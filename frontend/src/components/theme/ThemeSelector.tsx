import React, { useState } from 'react';
import { Dropdown, Button, Tooltip, Segmented, Space, Typography } from 'antd';
import {
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeMode } from '@/features/ui/uiSlice';
import type { MenuProps } from 'antd';

const { Text } = Typography;

export interface ThemeSelectorProps {
  variant?: 'pill' | 'button' | 'segmented';
  size?: 'small' | 'middle';
  style?: React.CSSProperties;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  variant = 'pill',
  size = 'middle',
  style,
}) => {
  const { themeMode, resolvedTheme, isDark, setThemeMode } = useTheme();
  const [hoveredKey, setHoveredKey] = useState<ThemeMode | null>(null);

  // Pill variant matching the enterprise capsule design (Light | Dark | System)
  if (variant === 'pill') {
    const options: Array<{ key: ThemeMode; label: string }> = [
      { key: 'light', label: 'Light' },
      { key: 'dark', label: 'Dark' },
      { key: 'system', label: 'System' },
    ];

    return (
      <div
        role="radiogroup"
        aria-label="Theme mode selector"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px',
          borderRadius: 9999,
          background: isDark ? '#141418' : '#f4f4f5',
          border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
          boxShadow: isDark
            ? 'inset 0 1px 2px rgba(0, 0, 0, 0.5)'
            : 'inset 0 1px 2px rgba(0, 0, 0, 0.04)',
          gap: '2px',
          userSelect: 'none',
          height: size === 'small' ? 30 : 34,
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {options.map((opt) => {
          const isActive = themeMode === opt.key;
          const isHovered = hoveredKey === opt.key && !isActive;

          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setThemeMode(opt.key)}
              onMouseEnter={() => setHoveredKey(opt.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: size === 'small' ? '0 10px' : '0 14px',
                height: size === 'small' ? 24 : 28,
                borderRadius: 9999,
                fontSize: size === 'small' ? 12 : 13,
                fontWeight: isActive ? 600 : 500,
                letterSpacing: '-0.01em',
                lineHeight: 1,
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                background: isActive
                  ? isDark
                    ? '#27272a'
                    : '#ffffff'
                  : isHovered
                  ? isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.04)'
                  : 'transparent',
                color: isActive
                  ? isDark
                    ? '#ffffff'
                    : '#09090b'
                  : isHovered
                  ? isDark
                    ? '#ffffff'
                    : '#09090b'
                  : isDark
                  ? '#a1a1aa'
                  : '#71717a',
                boxShadow: isActive
                  ? isDark
                    ? '0 1px 3px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                    : '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)'
                  : 'none',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  const getIcon = () => {
    if (themeMode === 'system') return <DesktopOutlined style={{ fontSize: 16 }} />;
    return isDark ? <MoonOutlined style={{ fontSize: 16 }} /> : <SunOutlined style={{ fontSize: 16 }} />;
  };

  const getLabel = () => {
    if (themeMode === 'system') return `System (${resolvedTheme})`;
    return themeMode === 'dark' ? 'Dark' : 'Light';
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'light',
      icon: <SunOutlined style={{ color: '#f59e0b', fontSize: 15 }} />,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 130 }}>
          <span>Light Mode</span>
          {themeMode === 'light' && <CheckOutlined style={{ color: 'var(--color-text)', fontSize: 12 }} />}
        </div>
      ),
      onClick: () => setThemeMode('light'),
    },
    {
      key: 'dark',
      icon: <MoonOutlined style={{ color: '#a1a1aa', fontSize: 15 }} />,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 130 }}>
          <span>Dark Mode</span>
          {themeMode === 'dark' && <CheckOutlined style={{ color: 'var(--color-text)', fontSize: 12 }} />}
        </div>
      ),
      onClick: () => setThemeMode('dark'),
    },
    {
      key: 'system',
      icon: <DesktopOutlined style={{ color: '#71717a', fontSize: 15 }} />,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 130 }}>
          <span>System Default</span>
          {themeMode === 'system' && <CheckOutlined style={{ color: 'var(--color-text)', fontSize: 12 }} />}
        </div>
      ),
      onClick: () => setThemeMode('system'),
    },
  ];

  if (variant === 'segmented') {
    return (
      <Segmented<ThemeMode>
        value={themeMode}
        onChange={(val) => setThemeMode(val)}
        options={[
          {
            label: (
              <Space size={6} style={{ padding: '0 4px' }}>
                <SunOutlined style={{ color: themeMode === 'light' ? '#f59e0b' : undefined }} />
                <span>Light</span>
              </Space>
            ),
            value: 'light',
          },
          {
            label: (
              <Space size={6} style={{ padding: '0 4px' }}>
                <MoonOutlined style={{ color: themeMode === 'dark' ? '#f4f4f5' : undefined }} />
                <span>Dark</span>
              </Space>
            ),
            value: 'dark',
          },
          {
            label: (
              <Space size={6} style={{ padding: '0 4px' }}>
                <DesktopOutlined style={{ color: themeMode === 'system' ? 'var(--color-text)' : undefined }} />
                <span>System</span>
              </Space>
            ),
            value: 'system',
          },
        ]}
      />
    );
  }

  return (
    <Tooltip title={`Theme: ${getLabel()} (Click to change)`} placement="bottom">
      <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
        <Button
          type="text"
          icon={getIcon()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text)',
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
            transition: 'all 0.2s ease',
            ...style,
          }}
        />
      </Dropdown>
    </Tooltip>
  );
};
