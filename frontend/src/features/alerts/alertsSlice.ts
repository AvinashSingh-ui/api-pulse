import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { alertsService } from '@/services/endpoints/alerts';
import type { Alert, AlertRule } from '@/types';

interface AlertsState {
  alerts:      Alert[];
  rules:       AlertRule[];
  activeCount: number;
  isLoading:   boolean;
  error:       string | null;
}

const initialState: AlertsState = {
  alerts:      [],
  rules:       [],
  activeCount: 0,
  isLoading:   false,
  error:       null,
};

export const fetchAlertsThunk = createAsyncThunk(
  'alerts/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await alertsService.listAlerts({ pageSize: 100 });
      return res.data;
    } catch (err: unknown) {
      return rejectWithValue((err as { message?: string })?.message ?? 'Failed to fetch alerts');
    }
  },
);

export const acknowledgeAlertThunk = createAsyncThunk(
  'alerts/acknowledge',
  async (id: string, { rejectWithValue }) => {
    try {
      return await alertsService.acknowledgeAlert(id);
    } catch (err: unknown) {
      return rejectWithValue((err as { message?: string })?.message ?? 'Failed to acknowledge alert');
    }
  },
);

export const resolveAlertThunk = createAsyncThunk(
  'alerts/resolve',
  async (id: string, { rejectWithValue }) => {
    try {
      return await alertsService.resolveAlert(id);
    } catch (err: unknown) {
      return rejectWithValue((err as { message?: string })?.message ?? 'Failed to resolve alert');
    }
  },
);

const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    setAlerts(state, action: PayloadAction<Alert[]>) {
      state.alerts      = action.payload;
      state.activeCount = action.payload.filter(a => a.status === 'active').length;
    },
    addAlert(state, action: PayloadAction<Alert>) {
      state.alerts.unshift(action.payload);
      if (action.payload.status === 'active') state.activeCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlertsThunk.pending,   (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchAlertsThunk.fulfilled,  (state, action) => {
        state.isLoading  = false;
        state.alerts      = action.payload;
        state.activeCount = action.payload.filter(a => a.status === 'active').length;
      })
      .addCase(fetchAlertsThunk.rejected,  (state, action) => {
        state.isLoading = false;
        state.error     = action.payload as string;
      })
      .addCase(acknowledgeAlertThunk.fulfilled, (state, action) => {
        const idx = state.alerts.findIndex(a => a.id === action.payload.id);
        if (idx !== -1) {
          state.alerts[idx] = action.payload;
          state.activeCount = state.alerts.filter(a => a.status === 'active').length;
        }
      })
      .addCase(resolveAlertThunk.fulfilled, (state, action) => {
        const idx = state.alerts.findIndex(a => a.id === action.payload.id);
        if (idx !== -1) {
          state.alerts[idx] = action.payload;
          state.activeCount = state.alerts.filter(a => a.status === 'active').length;
        }
      });
  },
});

export const { setAlerts, addAlert } = alertsSlice.actions;
export default alertsSlice.reducer;
