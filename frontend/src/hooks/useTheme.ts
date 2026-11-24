import { useEffect, useMemo } from 'react';
import { theme as antdTheme, ThemeConfig } from 'antd';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { setThemeMode, setResolvedTheme, ThemeMode } from '@/features/ui/uiSlice';

export function useTheme() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(s => s.ui.themeMode);
  const resolvedTheme = useAppSelector(s => s.ui.theme);

  // Sync with system preferences and DOM attributes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateTheme = () => {
      let isDark = false;
      if (themeMode === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = themeMode === 'dark';
      }

      const activeTheme: 'light' | 'dark' = isDark ? 'dark' : 'light';
      dispatch(setResolvedTheme(activeTheme));

      // Apply to HTML and body tags for global CSS variables and scrollbars
      document.documentElement.setAttribute('data-theme', activeTheme);
      document.body.setAttribute('data-theme', activeTheme);
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    };

    updateTheme();

    const handleChange = () => {
      if (themeMode === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode, dispatch]);

  const isDark = resolvedTheme === 'dark';

  // Centralized Ant Design Theme Tokens (Monochromatic High-Precision Enterprise Theme)
  const antdThemeConfig: ThemeConfig = useMemo(() => {
    const primaryColor = isDark ? '#f4f4f5' : '#09090b';
    const primaryHover = isDark ? '#e4e4e7' : '#27272a';

    return {
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: primaryColor,
        colorSuccess: '#10b981', // Clean Emerald
        colorWarning: '#f59e0b', // Solar Amber
        colorError: '#ef4444', // Clean Rose/Red
        colorInfo: '#71717a', // Sleek Zinc
        fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 14,
        borderRadius: 8,
        borderRadiusLG: 14,
        borderRadiusSM: 6,
        controlHeight: 38,
        // Monochromatic base colors
        colorBgBase: isDark ? '#09090b' : '#ffffff',
        colorBgContainer: isDark ? '#121215' : '#ffffff',
        colorBgElevated: isDark ? '#18181b' : '#ffffff',
        colorBgLayout: isDark ? '#09090b' : '#fafafa',
        colorBorder: isDark ? '#27272a' : '#e4e4e7',
        colorBorderSecondary: isDark ? '#1f1f23' : '#f4f4f5',
        // High contrast readable text
        colorTextBase: isDark ? '#f4f4f5' : '#09090b',
        colorTextSecondary: isDark ? '#a1a1aa' : '#52525b',
        colorTextTertiary: isDark ? '#8e8e93' : '#71717a',
        colorTextPlaceholder: isDark ? '#a1a1aa' : '#94a3b8',
        // Critical control tokens for Select, Dropdown, and Menu components
        controlItemBgActive: isDark ? '#27272a' : '#f4f4f5',
        controlItemBgHover: isDark ? '#1c1c20' : '#f8fafc',
        controlOutline: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        controlOutlineWidth: 1,
        boxShadow: isDark
          ? '0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.4)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        boxShadowSecondary: isDark
          ? '0 4px 14px -2px rgba(0, 0, 0, 0.6), 0 2px 6px -1px rgba(0, 0, 0, 0.4)'
          : '0 4px 14px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
      },
      components: {
        Layout: {
          siderBg: isDark ? '#09090b' : '#09090b',
          triggerBg: isDark ? '#121215' : '#18181b',
          headerBg: isDark ? 'rgba(9, 9, 11, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          headerHeight: 64,
          bodyBg: isDark ? '#09090b' : '#fafafa',
        },
        Menu: {
          darkItemBg: 'transparent',
          darkSubMenuItemBg: 'transparent',
          darkItemSelectedBg: 'rgba(255, 255, 255, 0.08)',
          darkItemColor: '#a1a1aa',
          darkItemSelectedColor: '#ffffff',
          darkItemHoverColor: '#ffffff',
          darkItemHoverBg: 'rgba(255, 255, 255, 0.04)',
          itemBorderRadius: 8,
          itemMarginInline: 8,
        },
        Card: {
          borderRadiusLG: 14,
          headerBg: 'transparent',
          colorBgContainer: isDark ? '#121215' : '#ffffff',
          colorBorderSecondary: isDark ? '#27272a' : '#e4e4e7',
          boxShadowTertiary: isDark
            ? '0 1px 3px rgba(0,0,0,0.4), 0 8px 24px -4px rgba(0,0,0,0.5)'
            : '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(0,0,0,0.04)',
        },
        Table: {
          borderRadius: 12,
          colorBgContainer: isDark ? '#121215' : '#ffffff',
          headerBg: isDark ? '#18181b' : '#f4f4f5',
          headerColor: isDark ? '#f4f4f5' : '#09090b',
          headerSplitColor: 'transparent',
          rowHoverBg: isDark ? '#18181b' : '#f8f9fa',
          cellPaddingBlock: 12,
          cellPaddingInline: 14,
          borderColor: isDark ? '#27272a' : '#e4e4e7',
        },
        Button: {
          borderRadius: 8,
          controlHeight: 38,
          fontWeight: 600,
          primaryColor: isDark ? '#09090b' : '#ffffff',
          defaultBg: isDark ? '#141418' : '#ffffff',
          defaultColor: isDark ? '#f4f4f5' : '#09090b',
          defaultBorderColor: isDark ? '#27272a' : '#d4d4d8',
          defaultHoverBg: isDark ? '#1c1c22' : '#f4f4f5',
          defaultHoverColor: isDark ? '#ffffff' : '#000000',
          defaultHoverBorderColor: isDark ? '#3f3f46' : '#a1a1aa',
          defaultActiveBg: isDark ? '#27272a' : '#e4e4e7',
          defaultActiveColor: isDark ? '#ffffff' : '#000000',
          defaultActiveBorderColor: isDark ? '#52525b' : '#71717a',
          primaryShadow: 'none',
        },
        Input: {
          borderRadius: 8,
          controlHeight: 38,
          colorBgContainer: isDark ? '#121215' : '#ffffff',
          colorBorder: isDark ? '#27272a' : '#d4d4d8',
          activeBorderColor: isDark ? '#52525b' : '#71717a',
          hoverBorderColor: isDark ? '#3f3f46' : '#a1a1aa',
          activeShadow: isDark ? '0 0 0 2px rgba(255,255,255,0.06)' : '0 0 0 2px rgba(0,0,0,0.04)',
          colorText: isDark ? '#f4f4f5' : '#09090b',
          colorTextPlaceholder: isDark ? '#a1a1aa' : '#94a3b8',
        },
        Select: {
          borderRadius: 8,
          controlHeight: 38,
          colorBgContainer: isDark ? '#121215' : '#ffffff',
          colorBorder: isDark ? '#27272a' : '#d4d4d8',
          colorText: isDark ? '#f4f4f5' : '#09090b',
          colorTextPlaceholder: isDark ? '#a1a1aa' : '#94a3b8',
          optionSelectedBg: isDark ? '#27272a' : '#f4f4f5',
          optionSelectedColor: isDark ? '#f4f4f5' : '#09090b',
          optionSelectedFontWeight: 600,
          optionActiveBg: isDark ? '#1c1c20' : '#f8fafc',
          hoverBorderColor: isDark ? '#3f3f46' : '#a1a1aa',
          activeBorderColor: isDark ? '#52525b' : '#71717a',
          activeOutlineColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        },
        Dropdown: {
          colorBgElevated: isDark ? '#18181b' : '#ffffff',
          colorText: isDark ? '#f4f4f5' : '#09090b',
          controlItemBgHover: isDark ? '#27272a' : '#f4f4f5',
          controlItemBgActive: isDark ? '#27272a' : '#f4f4f5',
        },
        Segmented: {
          borderRadius: 8,
          trackBg: isDark ? '#18181b' : '#f4f4f5',
          itemSelectedBg: isDark ? '#27272a' : '#ffffff',
          itemSelectedColor: isDark ? '#f4f4f5' : '#09090b',
          itemColor: isDark ? '#a1a1aa' : '#52525b',
          itemHoverBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
          controlHeight: 36,
        },
        Checkbox: {
          colorPrimary: isDark ? '#f4f4f5' : '#09090b',
          colorWhite: isDark ? '#09090b' : '#ffffff',
          colorBorder: isDark ? '#3f3f46' : '#d4d4d8',
          colorBgContainer: isDark ? '#18181b' : '#ffffff',
        },
        Tag: {
          borderRadiusSM: 6,
        },
        Badge: {
          borderRadiusSM: 8,
        },
        Tabs: {
          inkBarColor: isDark ? '#a1a1aa' : '#09090b',
          itemActiveColor: primaryColor,
          itemSelectedColor: primaryColor,
          itemHoverColor: primaryHover,
          itemColor: isDark ? '#a1a1aa' : '#71717a',
        },
        Modal: {
          borderRadiusLG: 14,
          contentBg: isDark ? '#121215' : '#ffffff',
          headerBg: isDark ? '#121215' : '#ffffff',
        },
        Drawer: {
          borderRadiusSM: 14,
          colorBgElevated: isDark ? '#121215' : '#ffffff',
        },
        Tooltip: {
          colorBgSpotlight: isDark ? '#27272a' : '#09090b',
        },
      },
    };
  }, [isDark]);

  const handleSetThemeMode = (mode: ThemeMode) => {
    dispatch(setThemeMode(mode));
  };

  const toggleTheme = () => {
    if (themeMode === 'light') handleSetThemeMode('dark');
    else if (themeMode === 'dark') handleSetThemeMode('system');
    else handleSetThemeMode('light');
  };

  return {
    themeMode,
    resolvedTheme,
    isDark,
    antdThemeConfig,
    setThemeMode: handleSetThemeMode,
    toggleTheme,
  };
}
