/** 2Libra 开放 API 的响应信封。 */
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

export type BoardId = 'latest' | 'hot24h' | 'hot7d' | 'value' | 'scores';

/** 分区：全站 / 顶层节点（含子节点） / 具体子节点。 */
export type Section =
  | { kind: 'all' }
  | { kind: 'parent'; slug: string }
  | { kind: 'node'; slug: string };

export interface ApiNode {
  id: string;
  slug: string;
  name: string;
  parent_id?: string | null;
  parent_slug?: string | null;
  post_count?: number;
  sort_order?: number;
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

export interface ScoreEntry {
  post: { short_id: string; node?: { slug?: string } | null };
  author?: Author | null;
  score: {
    id?: string;
    target_name?: string;
    score?: number;
    comment?: string;
    category?: string;
    created_at?: string;
    updated_at?: string;
  };
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

export interface ScorePage {
  items?: ScoreEntry[];
  total?: number;
  page?: number;
  limit?: number;
  total_pages?: number;
}
