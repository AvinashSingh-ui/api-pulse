import axios, { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { API_BASE_URL, API_TIMEOUT, TOKEN_KEY } from '@/constants';
import type { ApiError } from '@/types';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Request interceptor: attach bearer token ───────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: normalise errors ─────────────────
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ message?: string; detail?: string; code?: string }>) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';
    const isAuthRoute = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    // Auto-logout on 401 ONLY for authenticated session routes, NOT for login/register endpoints
    if (status === 401 && !isAuthRoute) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return Promise.reject(error);
    }

    const normalised: ApiError = {
      message:
        error.response?.data?.message ??
        error.response?.data?.detail ??
        error.message ??
        'An unexpected error occurred.',
      code:   error.response?.data?.code ?? String(status ?? 'NETWORK_ERROR'),
      status: status,
    };

    return Promise.reject(normalised);
  },
);

export default api;
