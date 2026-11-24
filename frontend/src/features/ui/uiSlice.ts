import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UIState {
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  activeProjectId:  string | null;
  themeMode:        ThemeMode;
  theme:            'light' | 'dark'; // resolved theme
}

const getSavedThemeMode = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('api_pulse_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  }
  return 'system';
};

const initialMode = getSavedThemeMode();
const getInitialResolvedTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode === 'dark' ? 'dark' : 'light';
};

const initialState: UIState = {
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  activeProjectId:  null,
  themeMode:        initialMode,
  theme:            getInitialResolvedTheme(initialMode),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    toggleMobileDrawer(state) {
      state.mobileDrawerOpen = !state.mobileDrawerOpen;
    },
    setMobileDrawerOpen(state, action: PayloadAction<boolean>) {
      state.mobileDrawerOpen = action.payload;
    },
    setActiveProject(state, action: PayloadAction<string | null>) {
      state.activeProjectId = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem('api_pulse_theme_mode', action.payload);
      }
      if (action.payload === 'system' && typeof window !== 'undefined') {
        state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        state.theme = action.payload === 'dark' ? 'dark' : 'light';
      }
    },
    setResolvedTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
    },
    setTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
      state.themeMode = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem('api_pulse_theme_mode', action.payload);
      }
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileDrawer,
  setMobileDrawerOpen,
  setActiveProject,
  setThemeMode,
  setResolvedTheme,
  setTheme,
} = uiSlice.actions;

export default uiSlice.reducer;
