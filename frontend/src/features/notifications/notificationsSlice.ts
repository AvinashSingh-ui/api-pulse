import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { NotificationPreferences, NotificationSeverity } from '@/types';

const PREFS_STORAGE_KEY = 'api_pulse_notification_prefs';

function loadStoredPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {
    soundEnabled: true,
    soundOnCritical: true,
    soundOnWarning: false,
    soundOnRecovery: true,
    inAppAlertsEnabled: true,
  };
}

interface NotificationsState {
  preferences: NotificationPreferences;
  unreadCount: number;
  isNotificationCenterOpen: boolean;
  activeFilter: 'all' | NotificationSeverity;
  activeEndpointFilter: string | 'all';
  notifiedIds: string[];
}

const initialState: NotificationsState = {
  preferences: loadStoredPreferences(),
  unreadCount: 0,
  isNotificationCenterOpen: false,
  activeFilter: 'all',
  activeEndpointFilter: 'all',
  notifiedIds: [],
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setPreferences(state, action: PayloadAction<Partial<NotificationPreferences>>) {
      state.preferences = { ...state.preferences, ...action.payload };
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(state.preferences));
      } catch {}
    },
    toggleNotificationCenter(state, action: PayloadAction<boolean | undefined>) {
      state.isNotificationCenterOpen = action.payload !== undefined ? action.payload : !state.isNotificationCenterOpen;
    },
    setActiveFilter(state, action: PayloadAction<'all' | NotificationSeverity>) {
      state.activeFilter = action.payload;
    },
    setActiveEndpointFilter(state, action: PayloadAction<string | 'all'>) {
      state.activeEndpointFilter = action.payload;
    },
    setUnreadCount(state, action: PayloadAction<number>) {
      state.unreadCount = action.payload;
    },
    recordNotifiedIds(state, action: PayloadAction<string[]>) {
      const combined = new Set([...state.notifiedIds, ...action.payload]);
      // Keep last 200 notified IDs
      state.notifiedIds = Array.from(combined).slice(-200);
    },
  },
});

export const {
  setPreferences,
  toggleNotificationCenter,
  setActiveFilter,
  setActiveEndpointFilter,
  setUnreadCount,
  recordNotifiedIds,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
