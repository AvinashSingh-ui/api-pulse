import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { store } from '@/app/store';
import AppRouter from '@/app/router';
import '@/styles/globals.css';

/** Ant Design custom theme – Modern Luxury Developer Observability Theme */
const antTheme = {
  token: {
    colorPrimary:        '#4f46e5', // Royal Electric Indigo
    colorSuccess:        '#10b981', // Clean Cyber Emerald
    colorWarning:        '#f59e0b', // Solar Amber
    colorError:          '#f43f5e', // Vibrant Crimson
    colorInfo:           '#06b6d4', // Modern Cyan
    colorBgBase:         '#f8fafc', // Soft Canvas
    colorBgContainer:    '#ffffff',
    borderRadius:        10,
    borderRadiusLG:      16,
    borderRadiusSM:      6,
    fontFamily:          "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize:            14,
    colorBorder:         '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',
    colorTextBase:       '#0f172a',
    colorTextSecondary:  '#475569',
    boxShadow:           '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
    boxShadowSecondary:  '0 4px 14px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
  },
  components: {
    Layout: {
      siderBg:       '#090d16',
      triggerBg:     '#131b2e',
      headerBg:      'rgba(255, 255, 255, 0.85)',
      headerHeight:  64,
    },
    Menu: {
      darkItemBg:           'transparent',
      darkSubMenuItemBg:    'transparent',
      darkItemSelectedBg:   'linear-gradient(90deg, rgba(79,70,229,0.18) 0%, rgba(99,102,241,0.06) 100%)',
      darkItemColor:        '#94a3b8',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverColor:   '#ffffff',
      darkItemHoverBg:      'rgba(255,255,255,0.05)',
      itemBorderRadius:     10,
      itemMarginInline:     8,
    },
    Card: {
      borderRadiusLG: 16,
      headerBg:       'transparent',
      boxShadowTertiary: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(0,0,0,0.04)',
    },
    Table: {
      borderRadius:  14,
      headerBg:      '#f8fafc',
      headerColor:   '#475569',
      headerSplitColor: 'transparent',
      rowHoverBg:    '#f8faff',
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
    },
    Button: {
      borderRadius: 10,
      controlHeight: 38,
      fontWeight:   600,
    },
    Input:  {
      borderRadius: 10,
      controlHeight: 38,
    },
    Select: {
      borderRadius: 10,
      controlHeight: 38,
    },
    Segmented: {
      borderRadius: 10,
      trackBg: '#f1f5f9',
      itemSelectedBg: '#ffffff',
      itemSelectedColor: '#4f46e5',
      itemHoverBg: 'rgba(255,255,255,0.6)',
      controlHeight: 36,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Badge:  {
      borderRadiusSM: 10,
    },
    Tabs: {
      inkBarColor:       '#4f46e5',
      itemActiveColor:   '#4f46e5',
      itemSelectedColor: '#4f46e5',
      itemHoverColor:    '#6366f1',
    },
    Modal: {
      borderRadiusLG: 18,
    },
    Drawer: {
      borderRadiusSM: 18,
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
