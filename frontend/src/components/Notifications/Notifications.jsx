/**
 * Notifications Page
 *
 * Lists in-app notifications for the current shop with mark-read actions.
 */
import React, { useCallback } from 'react';
import { Page, Button, BlockStack, Text, Spinner, Banner, Icon } from '@shopify/polaris';
import { NotificationIcon } from '@shopify/polaris-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut, unwrapData } from '../../services';
import { PageShell } from '../Shared';
import styles from './Notifications.module.css';

function Notifications() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiGet('/notifications', { limit: 50 });
      const d = unwrapData(res);
      return {
        notifications: d?.notifications ?? [],
        unreadCount: d?.unreadCount ?? 0,
      };
    },
  });

  const markRead = useCallback(
    async id => {
      try {
        await apiPut(`/notifications/${id}/read`);
        queryClient.setQueryData(['notifications'], prev => ({
          ...prev,
          notifications: (prev?.notifications ?? []).map(n =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, (prev?.unreadCount ?? 0) - 1),
        }));
      } catch {
        // ignore
      }
    },
    [queryClient]
  );

  const markAllRead = useCallback(async () => {
    try {
      await apiPut('/notifications/read-all');
      queryClient.setQueryData(['notifications'], prev => ({
        ...prev,
        notifications: (prev?.notifications ?? []).map(n => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  }, [queryClient]);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <PageShell className={styles.notificationsPage}>
      <Page title="" subtitle="">
        <div className={styles.notificationsLayout}>
          <div className={styles.notificationsHero}>
            <div className={styles.notificationsHeroIcon}>
              <Icon source={NotificationIcon} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className={styles.notificationsHeroTitle}>Notifications</h1>
              <p className={styles.notificationsHeroSubtitle}>
                In-app alerts for your store: test completion, significance updates, and system
                messages. Mark as read or clear all.
              </p>
            </div>
            {unreadCount > 0 && (
              <div className={styles.heroActions}>
                <Button variant="primary" size="slim" onClick={markAllRead}>
                  Mark all as read
                </Button>
              </div>
            )}
          </div>

          <div className={styles.notificationsBody}>
            {isError && (
              <Banner tone="critical" onDismiss={() => refetch()}>
                {error?.message || 'Failed to load notifications.'}
              </Banner>
            )}

            <div className={styles.notificationsCard}>
              <div className={styles.notificationsCardInner}>
                {isLoading ? (
                  <div className={styles.notificationsLoading}>
                    <Spinner accessibilityLabel="Loading notifications" size="large" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className={styles.notificationsEmpty}>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No notifications yet. You’ll see test alerts, significance updates, and system
                      messages here.
                    </Text>
                  </div>
                ) : (
                  <BlockStack gap="300">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className={`${styles.notificationListItem} ${!n.read ? styles.notificationListItemUnread : ''}`}
                      >
                        <p className={styles.notificationListTitle}>
                          {n.title || 'Notification'}
                          {!n.read && (
                            <Text as="span" variant="bodySm" tone="info">
                              {' '}
                              · New
                            </Text>
                          )}
                        </p>
                        {n.message && <p className={styles.notificationListMessage}>{n.message}</p>}
                        <p className={styles.notificationListMeta}>
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                        </p>
                        {!n.read && (
                          <div className={styles.notificationListActions}>
                            <Button size="slim" onClick={() => markRead(n.id)}>
                              Mark read
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </BlockStack>
                )}
              </div>
            </div>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default Notifications;
