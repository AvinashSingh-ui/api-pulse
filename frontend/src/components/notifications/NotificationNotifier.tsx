import React, { useEffect, useRef } from 'react';
import { notification as antNotification, Button, Space, Tag } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useGetNotificationsQuery, useMarkAsReadMutation } from '@/services/apiSlice';
import { recordNotifiedIds, setUnreadCount } from '@/features/notifications/notificationsSlice';
import { playNotificationSound } from '@/utils/audio';

export const NotificationNotifier: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const preferences = useAppSelector(s => s.notifications.preferences);
  const notifiedIds = useAppSelector(s => s.notifications.notifiedIds);

  const [markAsRead] = useMarkAsReadMutation();

  // Poll notifications every 6 seconds to capture live background scheduler updates
  const { data } = useGetNotificationsQuery(undefined, {
    pollingInterval: 6000,
    refetchOnFocus: true,
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!data) return;

    // Sync unread count to Redux
    dispatch(setUnreadCount(data.unreadCount ?? 0));

    // On initial mount, populate already existing notifications so we don't bombard user with sounds on fresh load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const initialIds = (data.data || []).map(n => n.id);
      dispatch(recordNotifiedIds(initialIds));
      return;
    }

    const unreadList = (data.data || []).filter(n => !n.isRead);
    const newItems = unreadList.filter(n => !notifiedIds.includes(n.id));

    if (newItems.length === 0) return;

    const newIds = newItems.map(n => n.id);
    dispatch(recordNotifiedIds(newIds));

    // Handle each newly detected notification
    newItems.forEach((n) => {
      // 1. Audio alerts based on user preferences
      if (preferences.soundEnabled) {
        if (n.severity === 'critical' && preferences.soundOnCritical) {
          playNotificationSound('critical');
        } else if (n.severity === 'warning' && preferences.soundOnWarning) {
          playNotificationSound('warning');
        } else if (n.severity === 'success' && preferences.soundOnRecovery) {
          playNotificationSound('success');
        }
      }

      // 2. In-App Notification Toast
      if (preferences.inAppAlertsEnabled) {
        const handleView = () => {
          antNotification.destroy(n.id);
          markAsRead(n.id);
          if (n.endpointId) {
            navigate(`/endpoints/${n.endpointId}`);
          } else {
            navigate('/alerts');
          }
        };

        const btn = (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={handleView}
            >
              View Endpoint
            </Button>
          </Space>
        );

        const config = {
          key: n.id,
          message: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{n.title}</span>
              {n.method && <Tag color="blue">{n.method}</Tag>}
            </div>
          ),
          description: (
            <div>
              <div style={{ color: '#475569', fontSize: 13, marginBottom: 6 }}>{n.message}</div>
              {n.metadata?.failureReason && (
                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>
                  Detail: {n.metadata.failureReason}
                </div>
              )}
            </div>
          ),
          btn,
          duration: n.severity === 'critical' ? 8 : 5,
        };

        if (n.severity === 'critical') {
          antNotification.error(config);
        } else if (n.severity === 'warning') {
          antNotification.warning(config);
        } else {
          antNotification.success(config);
        }
      }
    });
  }, [data, preferences, notifiedIds, dispatch, navigate, markAsRead]);

  return null;
};
