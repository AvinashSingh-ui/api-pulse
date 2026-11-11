import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  activeProjectId:  string | null;
  theme:            'light' | 'dark';
}

const initialState: UIState = {
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  activeProjectId:  null,
  theme:            'light',
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
    setTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileDrawer,
  setMobileDrawerOpen,
  setActiveProject,
  setTheme,
} = uiSlice.actions;

export default uiSlice.reducer;
