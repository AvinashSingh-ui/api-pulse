import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { store } from '@/app/store';
import AppRouter from '@/app/router';
import '@/styles/globals.css';

/** Ant Design custom theme – matches API Pulse design tokens */
const antTheme = {
  token: {
    colorPrimary:        '#4f8ef7',
    colorSuccess:        '#22c55e',
    colorWarning:        '#f59e0b',
    colorError:          '#ef4444',
    colorInfo:           '#3b82f6',
    colorBgBase:         '#f5f7fa',
    colorBgContainer:    '#ffffff',
    borderRadius:        8,
    borderRadiusLG:      12,
    borderRadiusSM:      4,
    fontFamily:          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize:            14,
    colorBorder:         '#e2e8f0',
    colorTextBase:       '#0f172a',
    colorTextSecondary:  '#64748b',
    boxShadow:           '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary:  '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
  },
  components: {
    Layout: {
      siderBg:       '#0f172a',
      triggerBg:     '#1e293b',
      headerBg:      '#ffffff',
      headerHeight:  60,
    },
    Menu: {
      darkItemBg:           'transparent',
      darkSubMenuItemBg:    'transparent',
      darkItemSelectedBg:   'rgba(79,142,247,0.15)',
      darkItemColor:        '#94a3b8',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverColor:   '#ffffff',
      darkItemHoverBg:      'rgba(255,255,255,0.06)',
      itemBorderRadius:     8,
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      borderRadius:  12,
      headerBg:      '#f8fafc',
      headerColor:   '#475569',
      rowHoverBg:    '#f0f4ff',
    },
    Button: {
      borderRadius: 8,
      fontWeight:   500,
    },
    Input:  { borderRadius: 8 },
    Select: { borderRadius: 8 },
    Tag:    { borderRadiusSM: 4 },
    Badge:  { borderRadiusSM: 10 },
    Tabs: {
      inkBarColor:       '#4f8ef7',
      itemActiveColor:   '#4f8ef7',
      itemSelectedColor: '#4f8ef7',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ConfigProvider theme={antTheme}>
          <AntApp>
            <AppRouter />
          </AntApp>
        </ConfigProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
);
