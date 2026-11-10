import { useState } from 'react';
import { normalizeAvatarUrl } from '../lib/format';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

/**
 * 头像图片。加载失败时整块消失，露出下层的首字母，不会出现破图。
 * 用 key=url 重新挂载：换了头像地址（重新授权、换账号）后失败状态自动重置。
 */
function AvatarImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <img
      src={url}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** 头像：图片加载失败或没有地址时自动露出首字母，避免出现破图。 */
export function Avatar({ src, name, className }: AvatarProps) {
  const url = normalizeAvatarUrl(src);
  const label = (name ?? '').trim();
  const initial = (label || '2').slice(0, 1).toUpperCase();

  return (
    <span className={`avatar${className ? ` ${className}` : ''}`}>
      <span className="avatar__initial" aria-hidden="true">
        {initial}
      </span>
      {url && <AvatarImage key={url} url={url} />}
    </span>
  );
}
