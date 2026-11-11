import { NOTIFICATION_FILTERS, type NotificationFilter } from '../lib/notification-filter';

interface NotificationFiltersProps {
  value: NotificationFilter;
  onChange: (value: NotificationFilter) => void;
  /** 弹窗预览更紧凑。 */
  variant?: 'dialog' | 'popup';
  disabled?: boolean;
}

/**
 * 通知分段筛选：全部 / 未读 / 回复 / 提及 / 表态 / 打赏。
 *
 * 直接对应接口已有的 `type` 与 `unread_only` 参数，切换后由数据层重新拉取，
 * 不在客户端对已加载的 50 条做假筛选。
 */
export function NotificationFilters({
  value,
  onChange,
  variant = 'dialog',
  disabled = false,
}: NotificationFiltersProps) {
  return (
    <div
      className={`notice-filters${variant === 'popup' ? ' notice-filters--popup' : ''}`}
      role="group"
      aria-label="按通知类别筛选"
    >
      {NOTIFICATION_FILTERS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={`notice-filter${active ? ' notice-filter--active' : ''}`}
            aria-pressed={active}
            title={option.description}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
