import { dateTime, relativeTime } from '../lib/format';
import {
  describeNotification,
  type AppNotification,
  type NotificationKind,
} from '../lib/notifications';
import { Avatar } from './Avatar';
import { CommentText } from './CommentText';
import { Icon, type IconName } from './Icon';

interface NotificationListProps {
  items: AppNotification[];
  /** 弹窗预览更紧凑；通知中心保留完整的元信息。 */
  variant?: 'dialog' | 'popup';
}

const ICONS: Record<NotificationKind, IconName> = {
  reply: 'arrow',
  reply_mention: 'arrow',
  mention: 'arrow',
  comment_pin: 'pin',
  favorite: 'bookmark',
  system: 'bell',
  pandora: 'flame',
  reaction: 'flame',
  get_reward: 'plus',
  level_up: 'up',
  content_check: 'check',
  badge_unlocked: 'check',
  follow: 'user',
  unknown: 'bell',
};

/**
 * 通知列表。把来源、具体操作、目标标题、评论正文和附加信息分层展示，
 * 通知中心和弹窗预览共用同一套字段，只是密度不同。
 */
export function NotificationList({ items, variant = 'dialog' }: NotificationListProps) {
  return (
    <ul className={variant === 'popup' ? 'notice-list notice-list--popup' : 'notice-list'}>
      {items.map((item) => {
        const view = describeNotification(item);
        const time = relativeTime(item.created_at);
        const icon = ICONS[view.kind];

        return (
          <li
            key={item.id}
            className={`notice-row${item.is_read ? '' : ' notice-row--unread'}`}
          >
            <a
              className="notice-row__link"
              href={view.targetHref}
              target="_blank"
              rel="noreferrer noopener"
              title="在站点查看这条通知"
            >
              <span
                className={`notice-row__avatar${view.actorName ? '' : ' notice-row__avatar--icon'}`}
              >
                {view.actorName ? (
                  <Avatar src={view.actorAvatar} name={view.actorName} />
                ) : (
                  <Icon name={icon} size={15} />
                )}
              </span>

              <span className="notice-row__body">
                <span className="notice-row__meta">
                  <span className={`notice-row__type notice-row__type--${view.tone}`}>
                    {view.typeLabel}
                  </span>
                  {view.actorIsAlias && <span className="notice-row__alias">匿名</span>}
                  {time && (
                    <>
                      <span aria-hidden="true">·</span>
                      <time className="t2-mono" dateTime={item.created_at} title={dateTime(item.created_at)}>
                        {time}
                      </time>
                    </>
                  )}
                  {!item.is_read && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="notice-row__unread">未读</span>
                    </>
                  )}
                </span>

                <span className="notice-row__title">
                  {view.actorName && <b>@{view.actorName}</b>}
                  <span>{view.action}</span>
                </span>

                {view.targetTitle && (
                  <span className="notice-row__target" title={view.targetTitle}>
                    {view.targetTitle}
                  </span>
                )}

                {view.excerpt && (
                  <span className="notice-row__excerpt" title={view.excerpt}>
                    <CommentText text={view.excerpt} emojis={item.emojis ?? {}} />
                  </span>
                )}

                {view.reactions.length > 0 && (
                  <span
                    className="notice-row__reactions"
                    aria-label={view.reactions
                      .map((reaction) => `${reaction.emoji} ${reaction.count}`)
                      .join('，')}
                  >
                    {view.reactions.map((reaction) => (
                      <span className="notice-reaction" key={`${reaction.emoji}:${reaction.count}`}>
                        <span className="notice-reaction__emoji">{reaction.emoji}</span>
                        {reaction.usernames.length > 0 ? (
                          <span
                            className="notice-reaction__users"
                            title={reaction.usernames.join('、')}
                          >
                            {reaction.usernames.map((username, index) => (
                              <span className="notice-reaction__user" key={username}>
                                {index > 0 && (
                                  <span className="notice-reaction__sep">、</span>
                                )}
                                {username}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="notice-reaction__count">×{reaction.count}</span>
                        )}
                        {reaction.usernames.length > 0 &&
                          reaction.count > reaction.usernames.length && (
                            <span className="notice-reaction__count">
                              等 {reaction.count} 人
                            </span>
                          )}
                      </span>
                    ))}
                  </span>
                )}

                {view.detail && (
                  <span className={`notice-row__detail notice-row__detail--${view.detailTone}`}>
                    {view.detail}
                  </span>
                )}

                {view.meta.length > 0 && (
                  <span className="notice-row__extra">{view.meta.join(' · ')}</span>
                )}
              </span>

              {item.is_read ? null : (
                <span className="notice-row__dot" aria-hidden="true" />
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
