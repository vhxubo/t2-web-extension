interface BrandProps {
  compact?: boolean;
  /** 品牌副标；传 null 可只留字标。 */
  sub?: string | null;
  /** 只显示叶片标记，不显示字标（用于空间紧张的弹窗）。 */
  markOnly?: boolean;
  /** 字标文案；默认全称，弹窗等空间紧张处直接复用默认值。 */
  name?: string;
}

/** 叶片标记 + 无衬线字标：整个界面唯一的品牌符号。 */
export function Brand({
  compact = false,
  sub = '帖子浏览',
  markOnly = false,
  name = 'T2 Web Extension',
}: BrandProps) {
  return (
    <span
      className={`brand${compact ? ' brand--compact' : ''}${markOnly ? ' brand--mark-only' : ''}`}
      role={markOnly ? 'img' : undefined}
      aria-label={markOnly ? 'T2 Web Extension' : undefined}
    >
      <svg className="brand__mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect x="0" y="0" width="28" height="28" rx="8.5" fill="var(--leaf)" />
        <path
          d="M14 21.4c0-7 3.7-11.6 9.3-12.3-.7 6.6-4.1 10.5-9.3 12.3Z"
          fill="var(--on-leaf)"
        />
        <path
          d="M14 21.4c0-5.4-2.7-9-7.3-10 1 5.2 3.5 8.3 7.3 10Z"
          fill="var(--on-leaf)"
          opacity="0.72"
        />
      </svg>
      {!markOnly && (
        <span className="brand__text">
          <span className="brand__name">{name}</span>
          {!compact && sub && <span className="brand__sub">{sub}</span>}
        </span>
      )}
    </span>
  );
}
