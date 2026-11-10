const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 中文相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 月日。 */
export function relativeTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = now - time;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return '昨天';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  const date = new Date(time);
  const today = new Date(now);
  const sameYear = date.getFullYear() === today.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function dateTime(iso?: string | null): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 顶部日期行：2026 年 11 月 10 日 · 周一。 */
export function todayLabel(date = new Date()): string {
  const weekday = WEEKDAYS[date.getDay()] ?? '一';
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · 周${weekday}`;
}

export function clockLabel(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function compactNumber(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  if (value >= 10000) {
    const short = value / 10000;
    return `${short >= 10 ? Math.round(short) : short.toFixed(1)}万`;
  }
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function rankLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function hostOf(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
