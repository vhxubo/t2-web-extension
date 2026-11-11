import { useEffect, useRef } from 'react';
import { LINKS } from '../lib/config';
import { describeError } from '../lib/errors';
import { useNotifications } from '../hooks/useNotifications';
import { Icon } from './Icon';
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

/** 通知中心：只读展示，标记已读仍需回到站点内完成。 */
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
  const { status, items, total, error, reload } = useNotifications({
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
  const unreadInList = items.filter((item) => !item.is_read).length;

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
        <div>
          <h2 className="dialog__title" id="notifications-title">
            通知
          </h2>
          <p className="dialog__desc">
            {sessionLoading
              ? '正在读取登录状态…'
              : signedIn
                ? unread > 0
                  ? `未读 ${unread} 条 · 这里展示最近 50 条`
                  : '暂无未读通知 · 这里展示最近 50 条'
                : '登录后可以查看通知'}
          </p>
        </div>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="关闭通知">
          <Icon name="close" size={16} />
        </button>
      </header>

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
            <span className="empty__title">没有通知</span>
            <span className="empty__desc">
              收到回复、提及、表态、打赏或系统消息时，会出现在这里。
            </span>
          </div>
        ) : (
          <>
            <NotificationList items={items} />
            {total > items.length && (
              <p className="notifications-dialog__more">
                还有 {total - items.length} 条更早的通知，请到站点查看。
              </p>
            )}
          </>
        )}
      </div>

      <footer className="dialog__foot">
        <span className="dialog__note">
          {signedIn && unreadInList > 0
            ? `当前列表里还有 ${unreadInList} 条未读；扩展只读，标记已读请到站点。`
            : '扩展只读通知，标记已读请到站点。'}
        </span>
        <div className="dialog__actions">
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
