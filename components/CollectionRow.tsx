import { collectionHref } from '../lib/me';
import { relativeTime } from '../lib/format';
import type { CollectionSummary } from '../lib/types';
import { Icon } from './Icon';

interface CollectionRowProps {
  collection: CollectionSummary;
  /** 当前登录用户名：站点合集入口是 `/user/<username>/post?collection=<name>`。 */
  owner?: string | null;
  compact?: boolean;
}

/** 「我的合集」里的一行：合集名 + 简介 + 帖子数，点开站点内的合集筛选页。 */
export function CollectionRow({ collection, owner, compact = false }: CollectionRowProps) {
  const href = collectionHref(collection, owner);
  const count = collection.post_count;
  const description = collection.description?.trim();

  return (
    <li className={`collection-row${compact ? ' collection-row--compact' : ''}`}>
      <a
        className="collection-row__link"
        href={href}
        target="_blank"
        rel="noreferrer"
        title={`打开合集「${collection.name}」`}
      >
        <span className="collection-row__icon" aria-hidden="true">
          📚
        </span>
        <span className="collection-row__body">
          <span className="collection-row__name">{collection.name}</span>
          {description && <span className="collection-row__desc">{description}</span>}
          {collection.created_at && (
            <span className="collection-row__meta">
              {relativeTime(collection.created_at)}创建
            </span>
          )}
        </span>
        {typeof count === 'number' && count >= 0 && (
          <span className="collection-row__count t2-mono" title={`合集内共 ${count} 篇帖子`}>
            {count} 篇
          </span>
        )}
        <Icon name="external" size={11} className="collection-row__go" />
      </a>
    </li>
  );
}
