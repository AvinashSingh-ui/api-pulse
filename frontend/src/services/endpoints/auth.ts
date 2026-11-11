import api from '@/services/api';
import type { User, LoginCredentials, RegisterCredentials } from '@/types';

export interface LoginResponse {
  user: User;
  token: string;
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
