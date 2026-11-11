import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { authService } from '@/services/endpoints/auth';
import { TOKEN_KEY, USER_KEY } from '@/constants';
import { storage } from '@/utils';
import type { AuthState, LoginCredentials, RegisterCredentials, User } from '@/types';

const initialState: AuthState = {
  user:            storage.get<User>(USER_KEY),
  token:           localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  isLoading:       false,
  error:           null,
};

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const data = await authService.login(credentials);
      return data;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Login failed';
      return rejectWithValue(msg);
    }
  },
);

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (credentials: RegisterCredentials, { rejectWithValue }) => {
    try {
      const data = await authService.register(credentials);
      return data;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Registration failed';
      return rejectWithValue(msg);
    }
  },
);

export const logoutThunk = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authService.logout();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Logout failed';
      return rejectWithValue(msg);
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      storage.set(USER_KEY, action.payload);
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // register
      .addCase(registerThunk.pending, (state) => {
        state.isLoading = true;
        state.error     = null;
      })
      .addCase(registerThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.error     = null;
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error     = action.payload as string;
      })
      // login
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error     = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isLoading       = false;
        state.isAuthenticated = true;
        state.user            = action.payload.user;
        state.token           = action.payload.token;
        localStorage.setItem(TOKEN_KEY, action.payload.token);
        storage.set(USER_KEY, action.payload.user);
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error     = action.payload as string;
      })
      // logout
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user            = null;
        state.token           = null;
        state.isAuthenticated = false;
        localStorage.removeItem(TOKEN_KEY);
        storage.remove(USER_KEY);
      });
  },
});

export const { setUser, clearError } = authSlice.actions;
export default authSlice.reducer;
