import React, { useState } from 'react';
import {
  Popover, Button, Badge, Space, Tag, Tabs, Empty,
  Typography, Tooltip, Popconfirm, Spin,
} from 'antd';
import {
  BellOutlined, CheckOutlined, DeleteOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  InfoCircleOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  useGetNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllAsReadMutation,
  useDeleteNotificationMutation,
  useClearAllNotificationsMutation,
} from '@/services/apiSlice';
import {
  toggleNotificationCenter,
  setActiveFilter,
} from '@/features/notifications/notificationsSlice';
import { HttpMethodTag } from '@/components/common/HttpMethodTag';
import { fromNow } from '@/utils';
import type { AppNotification, NotificationSeverity } from '@/types';

const { Text } = Typography;

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(s => s.notifications.isNotificationCenterOpen);
  const activeFilter = useAppSelector(s => s.notifications.activeFilter);

  const { data, isLoading } = useGetNotificationsQuery(undefined, {
    pollingInterval: 8000,
  });

  const [markAsRead] = useMarkAsReadMutation();
  const [markAllAsRead, { isLoading: isMarkingAll }] = useMarkAllAsReadMutation();
  const [deleteNotification] = useDeleteNotificationMutation();
  const [clearAllNotifications, { isLoading: isClearingAll }] = useClearAllNotificationsMutation();

  const notifications = data?.data || [];
  const unreadCount = data?.unreadCount ?? 0;

  // Filter notifications by selected severity
  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    return n.severity === activeFilter;
  });

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.isRead) {
      await markAsRead(n.id);
    }
    dispatch(toggleNotificationCenter(false));
    if (n.endpointId) {
      navigate(`/endpoints/${n.endpointId}`);
    } else {
      navigate('/alerts');
    }
  };

  const popoverContent = (
    <div style={{ width: 380, maxWidth: '90vw' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Notifications</span>
          {unreadCount > 0 && (
            <Tag color="processing" style={{ borderRadius: 10, fontSize: 11, padding: '0 6px' }}>
              {unreadCount} new
            </Tag>
          )}
        </div>
        <Space size={4}>
          {unreadCount > 0 && (
            <Tooltip title="Mark all as read">
              <Button
                size="small"
                type="text"
                icon={<CheckOutlined style={{ fontSize: 12 }} />}
                loading={isMarkingAll}
                onClick={() => markAllAsRead()}
              >
                Read all
              </Button>
            </Tooltip>
          )}
          {notifications.length > 0 && (
            <Popconfirm
              title="Clear all notifications?"
              onConfirm={() => clearAllNotifications()}
              okText="Clear"
              okButtonProps={{ danger: true, size: 'small' }}
              cancelButtonProps={{ size: 'small' }}
            >
              <Tooltip title="Clear all history">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  loading={isClearingAll}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* Filter Tabs */}
      <div style={{ padding: '0 16px', borderBottom: '1px solid #f1f5f9' }}>
        <Tabs
          size="small"
          activeKey={activeFilter}
          onChange={(key) => dispatch(setActiveFilter(key as 'all' | NotificationSeverity))}
          items={[
            { key: 'all', label: `All (${notifications.length})` },
            { key: 'critical', label: `Critical (${notifications.filter(n => n.severity === 'critical').length})` },
            { key: 'warning', label: `Warning (${notifications.filter(n => n.severity === 'warning').length})` },
            { key: 'success', label: `Recovered (${notifications.filter(n => n.severity === 'success').length})` },
          ]}
          style={{ marginBottom: 0 }}
        />
      </div>

      {/* Notification List */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {isLoading && notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0' }}>
            <Spin size="small" />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Checking alerts...</div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  No notifications {activeFilter !== 'all' ? `in ${activeFilter}` : 'yet'}
                </span>
              }
            />
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isCritical = n.severity === 'critical';
            const isWarning = n.severity === 'warning';
            const isSuccess = n.severity === 'success';

            const severityIcon = isCritical ? (
              <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16 }} />
            ) : isWarning ? (
              <WarningOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
            ) : isSuccess ? (
              <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />
            ) : (
              <InfoCircleOutlined style={{ color: '#0958d9', fontSize: 16 }} />
            );

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f8fafc',
                  background: n.isRead ? '#ffffff' : '#f0f7ff',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = n.isRead ? '#f8fafc' : '#e6f4ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = n.isRead ? '#ffffff' : '#f0f7ff';
                }}
              >
                {!n.isRead && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      left: 6,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#0958d9',
                    }}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ marginTop: 2 }}>{severityIcon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: n.isRead ? 500 : 700, color: '#0f172a' }}>
                        {n.title}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {fromNow(n.createdAt)}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, marginBottom: 6 }}>
                      {n.message}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {n.method && <HttpMethodTag method={n.method} size="sm" />}
                        {n.endpointPath && (
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0958d9', fontWeight: 600 }}>
                            {n.endpointPath}
                          </span>
                        )}
                      </div>

                      <Space size={4} onClick={(e) => e.stopPropagation()}>
                        {!n.isRead && (
                          <Tooltip title="Mark as read">
                            <Button
                              size="small"
                              type="text"
                              icon={<CheckOutlined style={{ fontSize: 10, color: '#0958d9' }} />}
                              onClick={() => markAsRead(n.id)}
                              style={{ width: 22, height: 22, padding: 0 }}
                            />
                          </Tooltip>
                        )}
                        <Tooltip title="Dismiss">
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                            onClick={() => deleteNotification(n.id)}
                            style={{ width: 22, height: 22, padding: 0 }}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderTop: '1px solid #f1f5f9',
        background: '#fafafa',
        borderRadius: '0 0 8px 8px',
      }}>
        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            dispatch(toggleNotificationCenter(false));
            navigate('/settings');
          }}
          style={{ padding: 0, fontSize: 12, color: '#64748b' }}
        >
          Audio & Alert Settings
        </Button>
        <Button
          type="link"
          size="small"
          onClick={() => {
            dispatch(toggleNotificationCenter(false));
            navigate('/alerts');
          }}
          style={{ padding: 0, fontSize: 12, color: '#0958d9', fontWeight: 600 }}
        >
          View All Alerts →
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={isOpen}
      onOpenChange={(open) => dispatch(toggleNotificationCenter(open))}
      placement="bottomRight"
      arrow={false}
      overlayInnerStyle={{ padding: 0, borderRadius: 12, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}
    >
      <Badge count={unreadCount} overflowCount={99} size="small">
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18, color: unreadCount > 0 ? '#0958d9' : '#475569' }} />}
          style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
        />
      </Badge>
    </Popover>
  );
};
