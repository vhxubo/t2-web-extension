import type { ReactionSummary, RewardSummary } from '../lib/types';

interface FeedSocialProps {
  reactions?: ReactionSummary[];
  rewards?: RewardSummary[];
}

function rewardTitle(rewards: RewardSummary[]): string {
  return rewards
    .map((reward) => {
      const name = reward.user?.username?.trim();
      return `${name ? `@${name} ` : ''}+${reward.amount ?? 0}`;
    })
    .join('，');
}

/** 关注流条目底部的表情表态与打赏汇总；没有数据时不占位。 */
export function FeedSocial({ reactions, rewards }: FeedSocialProps) {
  const counts = (reactions ?? []).filter((reaction) => reaction.count > 0);
  const total = (rewards ?? []).reduce((sum, reward) => sum + (reward.amount ?? 0), 0);
  if (counts.length === 0 && total <= 0) return null;

  return (
    <span className="feed-social">
      {counts.map((reaction) => (
        <span className="chip" key={reaction.emoji}>
          {reaction.emoji}
          <span className="t2-mono">{reaction.count}</span>
        </span>
      ))}
      {total > 0 && (
        <span className="chip chip--gold" title={rewardTitle(rewards ?? [])}>
          💰 <span className="t2-mono">{total}</span>
        </span>
      )}
    </span>
  );
}
