import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, TOKEN_KEY } from '@/constants';
import type { AppNotification, DashboardStats, PaginatedResponse } from '@/types';

export interface NotificationQueryParams {
  page?: number;
  pageSize?: number;
  severity?: string;
  endpointId?: string;
  unreadOnly?: boolean;
  search?: string;
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Notifications', 'HealthStats', 'Alerts'],
  endpoints: (builder) => ({
    getNotifications: builder.query<PaginatedResponse<AppNotification> & { unreadCount: number }, NotificationQueryParams | void>({
      query: (params) => ({
        url: '/notifications',
        params: params || {},
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Notifications' as const, id })),
              { type: 'Notifications', id: 'LIST' },
            ]
          : [{ type: 'Notifications', id: 'LIST' }],
    }),

    getUnreadCount: builder.query<{ unreadCount: number }, void>({
      query: () => '/notifications/unread-count',
      providesTags: [{ type: 'Notifications', id: 'COUNT' }],
    }),

    markAsRead: builder.mutation<{ success: boolean; notification: AppNotification }, string>({
      query: (id) => ({
        url: `/notifications/${id}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }, { type: 'Notifications', id: 'COUNT' }],
    }),

    markAllAsRead: builder.mutation<{ success: boolean; count: number }, void>({
      query: () => ({
        url: '/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }, { type: 'Notifications', id: 'COUNT' }],
    }),

    deleteNotification: builder.mutation<{ success: boolean; message: string; id: string }, string>({
      query: (id) => ({
        url: `/notifications/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }, { type: 'Notifications', id: 'COUNT' }],
    }),

    clearAllNotifications: builder.mutation<{ success: boolean; message: string }, void>({
      query: () => ({
        url: '/notifications',
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }, { type: 'Notifications', id: 'COUNT' }],
    }),

    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => '/monitoring/stats',
      providesTags: ['HealthStats'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkAsReadMutation,
  useMarkAllAsReadMutation,
  useDeleteNotificationMutation,
  useClearAllNotificationsMutation,
  useGetDashboardStatsQuery,
} = apiSlice;
