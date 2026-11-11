interface BrandProps {
  compact?: boolean;
  /** 品牌副标；传 null 可只留字标。 */
  sub?: string | null;
  /** 只显示图标标记，不显示字标（用于空间紧张的弹窗）。 */
  markOnly?: boolean;
  /** 字标文案；默认全称，弹窗等空间紧张处直接复用默认值。 */
  name?: string;
}

/** 图标标记 + 无衬线字标：整个界面唯一的品牌符号。 */
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
      {/* 直接复用扩展图标，和工具栏、页面 favicon 是同一张图，不再单独画 SVG。 */}
      <img
        className="brand__mark"
        src="/icon/128.png"
        alt=""
        width={28}
        height={28}
        draggable={false}
        aria-hidden="true"
      />
      {!markOnly && (
        <span className="brand__text">
          <span className="brand__name">{name}</span>
          {!compact && sub && <span className="brand__sub">{sub}</span>}
        </span>
      )}
    </span>
  );
}
