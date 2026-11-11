import { useCallback, useEffect, useRef } from 'react';
import { LINKS } from '../lib/config';
import { describeError } from '../lib/errors';
import { notificationFilterMeta } from '../lib/notification-filter';
import { useNotifications } from '../hooks/useNotifications';
import { Icon } from './Icon';
import { NotificationFilters } from './NotificationFilters';
import { NotificationList } from './NotificationList';

interface NotificationsDialogProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  /** 会话还在读取 storage 时先显示骨架，避免闪一下「还没有登录」。 */
  sessionLoading?: boolean;
  unread: number;
  onLogin: () => void;
  onRefreshUnread: () => void;
}

/** 消息中心：单条 / 全部「已读」都会调用服务端接口。 */
export function NotificationsDialog({
  open,
  onClose,
  signedIn,
  sessionLoading = false,
  unread,
  onLogin,
  onRefreshUnread,
}: NotificationsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const {
    status,
    items,
    total,
    error,
    reload,
    markRead,
    readingIds,
    markAllRead,
    markingAll,
    actionError,
    filter,
    setFilter,
  } = useNotifications({
    enabled: open,
    signedIn,
    sessionLoading,
    limit: 50,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    onRefreshUnread();
  }, [open, onRefreshUnread]);

  const errorInfo = status === 'error' ? describeError(error) : null;
  const actionErrorInfo = actionError ? describeError(actionError) : null;
  const filterMeta = notificationFilterMeta(filter);
  const unreadInList = items.filter((item) => !item.is_read).length;
  const canMarkAll = signedIn && !sessionLoading && (unread > 0 || unreadInList > 0);

  const handleRead = useCallback(
    async (id: string) => {
      if (await markRead(id)) onRefreshUnread();
    },
    [markRead, onRefreshUnread],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (await markAllRead()) onRefreshUnread();
  }, [markAllRead, onRefreshUnread]);

  return (
    <dialog
      ref={dialogRef}
      className="t2-dialog notifications-dialog"
      aria-labelledby="notifications-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="dialog__head">
        <h2 className="dialog__title" id="notifications-title">
          消息
        </h2>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="关闭消息">
          <Icon name="close" size={16} />
        </button>
      </header>

      {signedIn && !sessionLoading && (
        <div className="notifications-dialog__filters">
          <NotificationFilters value={filter} onChange={setFilter} />
        </div>
      )}

      <div className="dialog__body notifications-dialog__body">
        {sessionLoading ? (
          <div className="notice-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="notice-skeleton__row" key={index}>
                <span className="skeleton notice-skeleton__avatar" />
                <div className="notice-skeleton__body">
                  <span className="skeleton skeleton--line" />
                  <span className="skeleton skeleton--line skeleton--short" />
                </div>
              </div>
            ))}
          </div>
        ) : !signedIn ? (
          <div className="empty notifications-empty">
            <span className="empty__title">还没有登录</span>
            <span className="empty__desc">
              登录后，回复、提及和系统消息的未读数会显示在弹窗 Dock 的小红点上。
            </span>
            <div className="empty__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={onLogin}>
                登录
              </button>
            </div>
          </div>
        ) : status === 'loading' || status === 'idle' ? (
          <div className="notice-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="notice-skeleton__row" key={index}>
                <span className="skeleton notice-skeleton__avatar" />
                <div className="notice-skeleton__body">
                  <span className="skeleton skeleton--line" />
                  <span className="skeleton skeleton--line skeleton--short" />
                </div>
              </div>
            ))}
          </div>
        ) : errorInfo ? (
          <div className="banner banner--error" role="alert">
            <Icon name="alert" size={17} className="banner__icon" />
            <div className="banner__body">
              <strong className="banner__title">{errorInfo.title}</strong>
              {errorInfo.detail && <span>{errorInfo.detail}</span>}
              <div className="banner__actions">
                {errorInfo.action === 'login' && (
                  <button type="button" className="btn btn--sm btn--primary" onClick={onLogin}>
                    重新授权
                  </button>
                )}
                <button type="button" className="btn btn--sm" onClick={() => void reload()}>
                  重试
                </button>
              </div>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty notifications-empty">
            <span className="empty__title">{filterMeta.emptyTitle}</span>
            <span className="empty__desc">{filterMeta.emptyHint}</span>
            {filter !== 'all' && (
              <div className="empty__actions">
                <button type="button" className="btn btn--sm" onClick={() => setFilter('all')}>
                  查看全部
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <NotificationList
              items={items}
              onRead={handleRead}
              pendingReadIds={readingIds}
            />
            {total > items.length && (
              <p className="notifications-dialog__more">
                还有 {total - items.length} 条更早的消息，请到站点查看。
              </p>
            )}
          </>
        )}
      </div>

      <footer className="dialog__foot">
        {actionErrorInfo && (
          <span className="dialog__note dialog__note--error">
            操作失败：{actionErrorInfo.title}
          </span>
        )}
        <div className="dialog__actions">
          {signedIn && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void handleMarkAllRead()}
              disabled={!canMarkAll || markingAll}
              title="全部标记为已读（同步到站点）"
            >
              {markingAll ? '处理中…' : '全部已读'}
            </button>
          )}
          <a
            className="btn btn--sm"
            href={LINKS.notifications}
            target="_blank"
            rel="noreferrer"
          >
            在站点查看
            <Icon name="external" size={12} />
          </a>
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </footer>
    </dialog>
  );
}
