import type { ReactNode } from 'react';
import type { EmojiMap } from '../lib/emojis';

/** 正文里的表情短码，如 `:doge_ninja:`；两端冒号是接口约定的一部分。 */
const EMOJI_CODE = /(:[A-Za-z0-9_+-]+:)/g;

interface CommentTextProps {
  text: string;
  emojis: EmojiMap;
}

/**
 * 把评论正文里的短码渲染成站点表情图片。
 * 映射里没有的短码原样保留，不会吞字，也不会拼出不存在的图片地址。
 */
export function CommentText({ text, emojis }: CommentTextProps): ReactNode {
  if (!text) return text;
  if (!emojis || Object.keys(emojis).length === 0) return text;

  const parts = text.split(EMOJI_CODE);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, index) => {
        const url = emojis[part];
        if (!url) return part;
        return (
          <img
            key={`${index}:${part}`}
            className="comment-emoji"
            src={url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        );
      })}
    </>
  );
}
