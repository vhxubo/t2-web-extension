import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { profileHref } from '../lib/nav';
import { SIGNUP_URL } from '../lib/config';
import type { Profile } from '../lib/types';

interface AccountChipProps {
  signedIn: boolean;
  loading?: boolean;
  profile: Profile | null;
  onLogin: () => void;
  onSignOut?: () => void;
  compact?: boolean;
}

export function AccountChip({
  signedIn,
  loading = false,
  profile,
  onLogin,
  onSignOut,
  compact = false,
}: AccountChipProps) {
  if (loading) {
    return <span className="account account--loading skeleton skeleton--line" aria-hidden="true" />;
  }

  if (!signedIn) {
    return (
      <span className="account account--signed-out">
        <button type="button" className="btn btn--ghost account__login" onClick={onLogin}>
          <Icon name="user" size={16} />
          <span>登录</span>
        </button>
        <a
          className="btn btn--ghost account__signup"
          href={SIGNUP_URL}
          target="_blank"
          rel="noreferrer"
          title="还没有 2Libra 账号？去注册一个"
        >
          注册
        </a>
      </span>
    );
  }

  const name = profile?.display_name || profile?.username || '已登录';

  return (
    <span className="account">
      <a
        className="account__profile"
        href={profileHref(profile?.username)}
        target="_blank"
        rel="noreferrer"
        title={profile?.username ? `打开 @${profile.username} 的主页` : '打开站点'}
      >
        <Avatar src={profile?.avatar_url} name={name} />
        <span className="account__meta">
          <span className="account__name">{name}</span>
          {!compact && (
            <span className="account__level t2-mono">
              {typeof profile?.level === 'number' ? `Lv.${profile.level}` : '成员'}
              {profile?.is_pro ? ' · PRO' : ''}
            </span>
          )}
        </span>
      </a>
      {onSignOut && (
        <button
          type="button"
          className="btn btn--icon account__out"
          onClick={onSignOut}
          title="退出登录"
          aria-label="退出登录"
        >
          <Icon name="logout" size={16} />
        </button>
      )}
    </span>
  );
}
