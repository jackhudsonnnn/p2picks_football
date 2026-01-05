import React from "react";
import "./ProfileIcon.css";

type ProfileIconProps = {
  name: string;
  className?: string;
  size?: number;
  title?: string;
  ariaLabel?: string;
};

const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const ProfileIcon: React.FC<ProfileIconProps> = ({
  name,
  className,
  size,
  title,
  ariaLabel,
}) => {
  const initials = getInitials(name);
  const dimensionStyles = size
    ? {
        width: size,
        height: size,
        fontSize: Math.max(Math.round(size * 0.55), 10),
      }
    : undefined;

  return (
    <span
      className={`${className ? className + ' ' : ''}member-avatar`}
      style={dimensionStyles}
      title={title ?? name}
      aria-label={ariaLabel ?? `Avatar for ${name}`}
    >
      {initials}
    </span>
  );
};
