import type { ReactNode } from 'react';

export type IconName =
  | 'refresh'
  | 'settings'
  | 'user'
  | 'logout'
  | 'external'
  | 'chevron'
  | 'close'
  | 'check'
  | 'copy'
  | 'alert'
  | 'arrow'
  | 'pin'
  | 'hash'
  | 'flame'
  | 'chart'
  | 'bell';

const PATHS: Record<IconName, ReactNode> = {
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 4.5V11h-6.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9" />
      <path d="M19 7h1" />
      <path d="M4 17h3" />
      <path d="M13 17h7" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  logout: (
    <>
      <path d="M15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h10" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M15 5.5H6.5A2.5 2.5 0 0 0 4 8v8.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 2.9 20.2h18.2L12 3.8Z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 17.1v.1" />
    </>
  ),
  arrow: (
    <>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    </>
  ),
  pin: (
    <>
      <path d="M9.5 3.5h5l-.6 6 3.6 3.6H6.5l3.6-3.6-.6-6Z" />
      <path d="M12 13.1v7.4" />
    </>
  ),
  hash: (
    <>
      <path d="M5 9.5h14" />
      <path d="M5 14.5h14" />
      <path d="M10 4 8.5 20" />
      <path d="M15.5 4 14 20" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.4c.7 3.5-1.3 4.9-2.8 6.6a6.7 6.7 0 0 0-2 4.8 4.8 4.8 0 0 0 9.6 0c0-2.4-1.4-3.9-2.6-5.3-.4 1.3-1 2.1-1.8 2.7.6-3 0-5.9-.4-8.8Z" />
    </>
  ),
  chart: (
    <>
      <path d="M4.5 19.5h15" />
      <path d="M7.5 16.5v-3.6" />
      <path d="M12 16.5V7" />
      <path d="M16.5 16.5v-5.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9.2a6 6 0 1 0-12 0c0 4.7-2 5.8-2 5.8h16s-2-1.1-2-5.8Z" />
      <path d="M10.4 19.4a1.9 1.9 0 0 0 3.2 0" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
