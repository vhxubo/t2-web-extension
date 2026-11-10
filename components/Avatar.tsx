interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

/** 头像：图片加载失败时自动露出首字母，避免出现破图。 */
export function Avatar({ src, name, className }: AvatarProps) {
  const initial = (name ?? '2').slice(0, 1).toUpperCase() || '2';

  return (
    <span className={`avatar${className ? ` ${className}` : ''}`}>
      <span className="avatar__initial" aria-hidden="true">
        {initial}
      </span>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
