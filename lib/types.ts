/** 开放 API 的响应信封。 */
export interface Envelope<T> {
  c: number;
  m: string;
  d: T;
  t: number;
  code?: string;
  field?: string;
  required_scope?: string[];
  retry_after?: number;
  dimension?: string;
  scope?: string;
  limit?: number;
  remaining?: number;
  u?: string;
}

/** `/v1/topics` 的维度筛选。 */
export type TopicDimension = 'work' | 'life' | 'special';

export type BoardId = 'home' | 'hot24h' | 'hot7d' | 'latest' | 'community' | 'work' | 'life';

/** 分区：全站 / 顶层节点（含子节点） / 具体子节点。 */
export type Section =
  | { kind: 'all' }
  | { kind: 'parent'; slug: string }
  | { kind: 'node'; slug: string };

/**
 * 一个可配置视图（弹窗 Tab / 仪表盘卡片）的展示偏好。
 * 顺序由数组顺序决定；两个界面分别控制显隐，所以「都为 false」就是完全隐藏。
 */
export interface ViewPreference {
  /** 见 lib/viewIds.ts：board:<id> / section:all / section:p:<slug> / section:n:<slug>。 */
  id: string;
  /** 是否出现在弹窗 Tab 里（最多 6 个）。 */
  popup: boolean;
  /** 是否出现在仪表盘卡片里（不限数量）。 */
  dashboard: boolean;
}

export interface ApiNode {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  parent_slug?: string | null;
  post_count?: number;
  sort_order?: number;
  /** 接口文档用单数 dimension，早期代码用复数；两个都兼容。 */
  dimension?: string | null;
  dimensions?: string | null;
  require_login?: boolean;
  children?: ApiNode[];
}

export interface Author {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  level?: number;
  is_pro?: boolean;
  role?: string;
}

export interface TopicNodeRef {
  id?: string;
  slug: string;
  name?: string;
  parent_slug?: string | null;
}

export interface Topic {
  id?: string;
  short_id: string;
  title?: string;
  type?: string;
  is_pinned?: boolean;
  comment_count?: number;
  views?: number;
  created_at?: string;
  latest_commented_at?: string;
  author?: Author | null;
  node: TopicNodeRef;
  tags?: { name?: string }[];
  hotScore?: number;
  status?: string;
}

export interface Profile {
  id?: string;
  username?: string;
  user_number?: string;
  display_name?: string;
  avatar_url?: string | null;
  level?: number;
  is_pro?: boolean;
  role?: string;
}

export interface TopicPage {
  posts?: Topic[];
  total?: number;
  page?: number;
  limit?: number;
  total_pages?: number;
}
