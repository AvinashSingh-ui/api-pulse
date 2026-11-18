import api from '@/services/api';
import type { AppNotification, PaginatedResponse } from '@/types';

export interface NotificationListParams {
  page?: number;
  pageSize?: number;
  severity?: string;
  endpointId?: string;
  unreadOnly?: boolean;
  search?: string;
}

export const notificationsService = {
  list: (params?: NotificationListParams) =>
    api.get<PaginatedResponse<AppNotification> & { unreadCount: number }>('/notifications', { params }).then(r => r.data),

  getUnreadCount: () =>
    api.get<{ unreadCount: number }>('/notifications/unread-count').then(r => r.data),

  markAsRead: (id: string) =>
    api.patch<{ success: boolean; notification: AppNotification }>(`/notifications/${id}/read`).then(r => r.data),

  markAllAsRead: () =>
    api.post<{ success: boolean; count: number }>('/notifications/read-all').then(r => r.data),

  delete: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/notifications/${id}`).then(r => r.data),

  clearAll: () =>
    api.delete<{ success: boolean; count: number }>('/notifications/clear-all').then(r => r.data),
};
