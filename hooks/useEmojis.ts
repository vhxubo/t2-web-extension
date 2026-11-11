import { useEffect, useState } from 'react';
import { loadEmojiMap, type EmojiMap } from '../lib/emojis';

/**
 * 评论区需要的表情映射。只在真的展示评论时加载一次，
 * 拉不到就返回空映射（正文里保留 `:code:` 原文）。
 */
export function useEmojiMap(enabled: boolean): EmojiMap {
  const [map, setMap] = useState<EmojiMap>({});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadEmojiMap().then((value) => {
      if (alive) setMap(value);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return map;
}
