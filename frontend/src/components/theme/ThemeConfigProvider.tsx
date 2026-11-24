import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { useTheme } from '@/hooks/useTheme';

interface ThemeConfigProviderProps {
  children: React.ReactNode;
}

export const ThemeConfigProvider: React.FC<ThemeConfigProviderProps> = ({ children }) => {
  const { antdThemeConfig } = useTheme();

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <AntApp>
        {children}
      </AntApp>
    </ConfigProvider>
  );
};
