import api from '@/services/api';
import type { User, LoginCredentials, RegisterCredentials } from '@/types';

export interface LoginResponse {
  user: User;
  token: string;
}

export interface SendOtpResponse {
  success: boolean;
  email: string;
  provider: string;
  expiresIn: number;
  message: string;
  previewOtp?: string;
  previewUrl?: string;
}

export const authService = {
  register: async (credentials: RegisterCredentials): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/register', credentials);
    return res.data;
  },

  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/login', credentials);
    return res.data;
  },

  oauthLogin: async (data: { provider: 'google' | 'microsoft'; email?: string; name?: string }): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/oauth', data);
    return res.data;
  },

  sendOidcOtp: async (data: { provider: 'google' | 'microsoft' | 'email'; email: string }): Promise<SendOtpResponse> => {
    const res = await api.post<SendOtpResponse>('/auth/oidc/send-otp', data);
    return res.data;
  },

  verifyOidcOtp: async (data: {
    provider: 'google' | 'microsoft' | 'email';
    email: string;
    otp: string;
    name?: string;
  }): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/oidc/verify-otp', data);
    return res.data;
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore network errors on logout
    }
    localStorage.removeItem('api_pulse_token');
    localStorage.removeItem('api_pulse_user');
  },

  me: async (): Promise<User> => {
    const res = await api.get<User>('/auth/me');
    return res.data;
  },

  refreshToken: async (): Promise<{ token: string }> => {
    const res = await api.post<{ token: string }>('/auth/refresh');
    return res.data;
  },
};
 