import type { ReactNode } from 'react';
import { APP_ORIGIN } from '../lib/config';
import type { EmojiMap } from '../lib/emojis';
import { CommentText } from './CommentText';

/* ------------------------------------------------------------------
   帖子正文的轻量 markdown 渲染。
   只处理站点常见的段落 / 标题 / 列表 / 引用 / 代码 / 图片 / 链接 / 强调，
   全部通过 React 文本节点输出，不注入 HTML，也不引入额外的解析依赖。
------------------------------------------------------------------ */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'hr' };

const INLINE_SOURCE =
  '(!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)' +
  '|\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)' +
  '|`([^`\\n]+)`' +
  '|\\*\\*([^*\\n]+)\\*\\*' +
  '|(?<![\\w])__([^_\\n]+)__(?![\\w])' +
  '|~~([^~\\n]+)~~' +
  '|\\*([^*\\n]+)\\*' +
  '|(?<![\\w])_([^_\\n]+)_(?![\\w]))';

const URL_SOURCE = '(https?:\\/\\/[^\\s<>"\'，。；：！？、）】]+)';

/** 只接受 http(s) / 站内相对路径 / 协议相对地址，避免 javascript: 之类的链接。 */
function safeHref(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${APP_ORIGIN}${value}`;
  return null;
}

/** 文本节点里的裸链接也变成可点的外链，同时保留表情短码渲染。 */
function renderText(text: string, emojis: EmojiMap, keyBase: string): ReactNode[] {
  if (!text) return [];
  const parts = text.split(new RegExp(URL_SOURCE, 'g'));
  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyBase}:t${index}`;
    if (index % 2 === 1) {
      const href = safeHref(part);
      if (href) {
        return (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {part}
          </a>
        );
      }
    }
    return <CommentText key={key} text={part} emojis={emojis} />;
  });
}

function renderInline(
  text: string,
  emojis: EmojiMap,
  keyBase: string,
  depth = 0,
): ReactNode[] {
  if (!text) return [];
  // 异常嵌套时保底按纯文本输出，避免解析器无限递归。
  if (depth > 4) return renderText(text, emojis, keyBase);

  const pattern = new RegExp(INLINE_SOURCE, 'g');
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      nodes.push(...renderText(text.slice(last, match.index), emojis, `${keyBase}:h${match.index}`));
    }
    const key = `${keyBase}:m${match.index}`;

    if (match[2] !== undefined) {
      // 图片：![alt](url)
      const alt = match[2] ?? '';
      const href = safeHref(match[3]);
      if (href) {
        nodes.push(
          <a
            key={key}
            className="topic-md__image-link"
            href={href}
            target="_blank"
            rel="noreferrer"
            title={alt || '查看图片'}
          >
            <img
              className="topic-md__image"
              src={href}
              alt={alt}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </a>,
        );
      } else {
        nodes.push(match[0]);
      }
    } else if (match[4] !== undefined) {
      // 链接：[文字](url)
      const label = match[4] ?? '';
      const href = safeHref(match[5]);
      if (href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {renderInline(label, emojis, `${key}:l`, depth + 1)}
          </a>,
        );
      } else {
        nodes.push(...renderInline(label, emojis, `${key}:l`, depth + 1));
      }
    } else if (match[6] !== undefined) {
      nodes.push(
        <code key={key} className="topic-md__inline-code">
          {match[6]}
        </code>,
      );
    } else {
      const content =
        match[7] ?? match[8] ?? match[9] ?? match[10] ?? match[11] ?? '';
      let node: ReactNode;
      if (match[7] !== undefined || match[8] !== undefined) {
        node = <strong key={key}>{renderInline(content, emojis, key, depth + 1)}</strong>;
      } else if (match[9] !== undefined) {
        node = <del key={key}>{renderInline(content, emojis, key, depth + 1)}</del>;
      } else {
        node = <em key={key}>{renderInline(content, emojis, key, depth + 1)}</em>;
      }
      nodes.push(node);
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(...renderText(text.slice(last), emojis, `${keyBase}:tail`));
  }
  return nodes;
}

function isFence(line: string): boolean {
  return /^\s*(?:`{3,}|~{3,})/.test(line);
}

function isHeading(line: string): boolean {
  return /^\s*#{1,6}\s+/.test(line);
}

function isHr(line: string): boolean {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isQuote(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function isBlockStart(line: string): boolean {
  return isFence(line) || isHeading(line) || isHr(line) || isQuote(line) || isListItem(line);
}

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (!line.trim()) {
      index += 1;
      continue;
    }

    // 围栏代码块
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1]![0]!;
      const lang = (fence[2] ?? '').trim().split(/\s+/)[0] ?? '';
      const closing = new RegExp(`^\\s*${marker}{3,}\\s*$`);
      index += 1;
      const buffer: string[] = [];
      while (index < lines.length && !closing.test(lines[index]!)) {
        buffer.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) index += 1; // 跳过收尾围栏
      blocks.push({ kind: 'code', lang, text: buffer.join('\n') });
      continue;
    }

    // 标题
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        text: (heading[2] ?? '').trim(),
      });
      index += 1;
      continue;
    }

    // 分隔线
    if (isHr(line)) {
      blocks.push({ kind: 'hr' });
      index += 1;
      continue;
    }

    // 引用：连续以 > 开头的行合并成一段
    if (isQuote(line)) {
      const quote: string[] = [];
      while (index < lines.length && isQuote(lines[index]!)) {
        quote.push(lines[index]!.replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'quote', text: quote.join('\n') });
      continue;
    }

    // 列表：只处理同层级的连续条目
    const firstItem = LIST_ITEM.exec(line);
    if (firstItem) {
      const ordered = /^\d/.test(firstItem[1]!);
      const items: string[] = [];
      while (index < lines.length) {
        const item = LIST_ITEM.exec(lines[index]!);
        if (!item) break;
        if (/^\d/.test(item[1]!) !== ordered) break;
        items.push(item[2] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // 段落：一直吃到空行或下一个块级标记
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !isBlockStart(lines[index]!)) {
      paragraph.push(lines[index]!);
      index += 1;
    }
    if (paragraph.length === 0) {
      // 理论上不会发生；兜底推进，避免死循环。
      paragraph.push(line);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

function renderBlock(block: Block, index: number, emojis: EmojiMap): ReactNode {
  const key = `b${index}`;

  switch (block.kind) {
    case 'heading': {
      const level = Math.min(block.level + 2, 6);
      const Tag = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag key={key} className="topic-md__heading">
          {renderInline(block.text, emojis, key)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="topic-md__paragraph">
          {renderInline(block.text, emojis, key)}
        </p>
      );
    case 'code':
      return (
        <div key={key} className="topic-md__pre">
          {block.lang && <span className="topic-md__lang">{block.lang}</span>}
          <pre>
            <code>{block.text}</code>
          </pre>
        </div>
      );
    case 'quote':
      return (
        <blockquote key={key} className="topic-md__quote">
          {renderInline(block.text, emojis, key)}
        </blockquote>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key} className="topic-md__list">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}:${itemIndex}`}>
              {renderInline(item, emojis, `${key}:${itemIndex}`)}
            </li>
          ))}
        </Tag>
      );
    }
    case 'hr':
      return <hr key={key} className="topic-md__hr" />;
  }
}

interface TopicMarkdownProps {
  content?: string | null;
  emojis: EmojiMap;
}

/** 帖子正文：markdown → React 节点；没有正文时给一句占位。 */
export function TopicMarkdown({ content, emojis }: TopicMarkdownProps) {
  const text = content?.trim();
  if (!text) return <p className="topic-md__empty">（这条帖子没有正文）</p>;

  return (
    <div className="topic-md">
      {parseBlocks(text).map((block, index) => renderBlock(block, index, emojis))}
    </div>
  );
}
