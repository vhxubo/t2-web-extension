/**
 * 表情短码映射（`GET /v1/emojis`）。
 *
 * 评论正文里的 `:doge_ninja:` 是短码，不换成图片就只会显示一串冒号文字。
 * 这个映射变化极少：内存缓存 + storage 缓存 7 天，失败时退回旧缓存 / 空映射，
 * 宁可暂时显示原文，也不让「最新评论」整块加载失败。
 */
import { apiGet } from './api';
import { emojisCacheItem } from './storage';

export type EmojiMap = Record<string, string>;

interface ApiEmoji {
  code?: string | null;
  img_url?: string | null;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

let memo: EmojiMap | null = null;
let pending: Promise<EmojiMap> | null = null;

function buildMap(list: unknown): EmojiMap {
  const map: EmojiMap = {};
  if (!Array.isArray(list)) return map;
  for (const item of list as ApiEmoji[]) {
    if (typeof item?.code !== 'string' || typeof item?.img_url !== 'string') continue;
    const code = item.code.trim();
    const url = item.img_url.trim();
    if (code.startsWith(':') && code.endsWith(':') && url) map[code] = url;
  }
  return map;
}

export function loadEmojiMap(): Promise<EmojiMap> {
  if (memo) return Promise.resolve(memo);
  if (pending) return pending;

  pending = (async () => {
    try {
      const cached = await emojisCacheItem.getValue().catch(() => null);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        memo = cached.map ?? {};
        return memo;
      }

      try {
        const list = await apiGet<ApiEmoji[]>('/v1/emojis', { auth: false });
        const map = buildMap(list);
        memo = map;
        await emojisCacheItem
          .setValue({ fetchedAt: Date.now(), map })
          .catch(() => undefined);
        return map;
      } catch {
        // 拉取失败：旧的映射还能用就继续用，否则退回空映射（显示短码原文）。
        memo = cached?.map ?? {};
        return memo;
      }
    } finally {
      pending = null;
    }
  })();

  return pending;
}
