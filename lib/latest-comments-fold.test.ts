import { describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import {
  applyCommentFolds,
  clearCommentFolds,
  FOLD_ATTR,
  FOLD_DEFAULT_LENGTH,
  findCommentLists,
  HIDDEN_ATTR,
  isCommentItem,
} from './latest-comments-fold';

/** 最小化的「最新评论」行：作者链接 + 带 commentId 的帖子链接。 */
function comment(author: string, id: string, withAuthor = true): string {
  return `<li>
    <div class="head">${
      withAuthor ? `<a href="/user/${author}/about">${author}</a>` : ''
    }</div>
    <div class="body">content ${id}</div>
    <div class="foot"><a href="/post/node/short?commentId=${id}">post</a></div>
  </li>`;
}

function makeDoc(rows: string): Document {
  const { document } = parseHTML(
    `<!doctype html><html><head></head><body><ul>${rows}</ul></body></html>`,
  );
  return document as unknown as Document;
}

function buttons(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll(`.t2-comment-fold__btn`)) as unknown as HTMLElement[];
}

function hiddenRows(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(`[${HIDDEN_ATTR}]`));
}

function hiddenBodies(doc: Document): (string | null | undefined)[] {
  return Array.from(doc.querySelectorAll(`[${HIDDEN_ATTR}] .body`)).map(
    (row) => row.textContent?.trim(),
  );
}

describe('isCommentItem / findCommentLists', () => {
  test('recognises rows with a user link and a commentId post link', () => {
    const doc = makeDoc(comment('alice', 'a1'));
    const item = doc.querySelector('li');
    if (!item) throw new Error('missing item');
    expect(isCommentItem(item)).toBe(true);

    const noAuthor = makeDoc(comment('alice', 'a1', false)).querySelector('li');
    if (!noAuthor) throw new Error('missing item');
    expect(isCommentItem(noAuthor)).toBe(false);
  });

  test('finds lists that contain comment rows', () => {
    const doc = makeDoc(comment('alice', 'a1') + comment('bob', 'b1'));
    expect(findCommentLists(doc)).toHaveLength(1);
    expect(findCommentLists(makeDoc('<li>menu</li>'))).toHaveLength(0);
  });
});

describe('applyCommentFolds', () => {
  test('folds a run of three or more and shows the first comment only', () => {
    const doc = makeDoc(
      comment('alice', 'a1') + comment('alice', 'a2') + comment('alice', 'a3') +
        comment('bob', 'b1'),
    );
    const expanded = new Set<string>();
    const toggles: string[] = [];
    const folded = applyCommentFolds(doc, {
      expanded,
      onToggle: (key) => toggles.push(key),
    });

    expect(folded).toBe(1);
    expect(FOLD_DEFAULT_LENGTH).toBe(3);
    expect(hiddenRows(doc)).toHaveLength(2);
    expect(hiddenBodies(doc)).toEqual(['content a2', 'content a3']);

    const toggle = buttons(doc)[0];
    expect(toggle).toBeDefined();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('@alice');
    expect(toggle?.textContent).toContain('展开 @alice 的 2 条连续评论');
    expect(toggle?.getAttribute('title')).toBe('展开 @alice 的 2 条连续评论');
    expect(toggle?.querySelector('.t2-comment-fold__glyph')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(toggle?.closest('li')).toBe(doc.querySelector('ul > li'));

    const view = doc.defaultView;
    if (!view) throw new Error('missing window');
    toggle?.dispatchEvent(new view.Event('click', { bubbles: true, cancelable: true }));
    expect(toggles).toEqual(['a1']);
  });

  test('renders the whole run and a collapse action when already expanded', () => {
    const doc = makeDoc(
      comment('alice', 'a1') + comment('alice', 'a2') + comment('alice', 'a3'),
    );
    const folded = applyCommentFolds(doc, {
      expanded: new Set(['a1']),
      onToggle: () => undefined,
    });

    expect(folded).toBe(1);
    expect(hiddenRows(doc)).toHaveLength(0);
    const toggle = buttons(doc)[0];
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent).toBe('已展开连续评论 · 收起 ▴');
    expect(toggle?.textContent).toContain('收起');
  });

  test('leaves runs shorter than the threshold untouched', () => {
    const doc = makeDoc(comment('alice', 'a1') + comment('alice', 'a2'));
    const folded = applyCommentFolds(doc, {
      expanded: new Set(),
      onToggle: () => undefined,
    });

    expect(folded).toBe(0);
    expect(hiddenRows(doc)).toHaveLength(0);
    expect(buttons(doc)).toHaveLength(0);
  });

  test('supports a configurable threshold of two', () => {
    const doc = makeDoc(comment('alice', 'a1') + comment('alice', 'a2'));
    const folded = applyCommentFolds(doc, {
      expanded: new Set(),
      onToggle: () => undefined,
      minLength: 2,
    });

    expect(folded).toBe(1);
    expect(hiddenRows(doc)).toHaveLength(1);
    expect(buttons(doc)[0]?.textContent).toContain('展开 @alice 的 1 条连续评论');
  });

  test('only folds adjacent comments of the same author', () => {
    const doc = makeDoc(
      comment('alice', 'a1') +
        comment('bob', 'b1') +
        comment('alice', 'a2') +
        comment('alice', 'a3') +
        comment('alice', 'a4'),
    );
    const folded = applyCommentFolds(doc, {
      expanded: new Set(),
      onToggle: () => undefined,
    });

    expect(folded).toBe(1);
    expect(hiddenRows(doc)).toHaveLength(2);
    expect(hiddenBodies(doc)).toEqual(['content a3', 'content a4']);
    expect(buttons(doc)[0]?.textContent).toContain('展开 @alice 的 2 条连续评论');
  });

  test('breaks runs on non-comment rows', () => {
    const doc = makeDoc(
      comment('alice', 'a1') +
        comment('alice', 'a2') +
        '<li class="ad">sponsored</li>' +
        comment('alice', 'a3'),
    );
    const folded = applyCommentFolds(doc, {
      expanded: new Set(),
      onToggle: () => undefined,
    });

    expect(folded).toBe(0);
    expect(buttons(doc)).toHaveLength(0);
  });

  test('does not fold comments without an author link', () => {
    const doc = makeDoc(
      comment('alice', 'a1', false) +
        comment('alice', 'a2', false) +
        comment('alice', 'a3', false),
    );
    const folded = applyCommentFolds(doc, {
      expanded: new Set(),
      onToggle: () => undefined,
    });

    expect(folded).toBe(0);
    expect(hiddenRows(doc)).toHaveLength(0);
  });

  test('is idempotent and clearCommentFolds restores the list', () => {
    const doc = makeDoc(
      comment('alice', 'a1') + comment('alice', 'a2') + comment('alice', 'a3'),
    );
    const options = { expanded: new Set<string>(), onToggle: () => undefined };

    applyCommentFolds(doc, options);
    applyCommentFolds(doc, options);

    expect(doc.querySelectorAll(`[${FOLD_ATTR}]`)).toHaveLength(1);
    expect(doc.querySelectorAll('ul > li')).toHaveLength(3);

    clearCommentFolds(doc);
    expect(doc.querySelectorAll(`[${FOLD_ATTR}]`)).toHaveLength(0);
    expect(hiddenRows(doc)).toHaveLength(0);
    expect(doc.querySelectorAll('ul > li')).toHaveLength(3);
  });
});
