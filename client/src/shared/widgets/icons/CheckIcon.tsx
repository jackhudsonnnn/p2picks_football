import React from "react";

type Props = {
  className?: string;
  title?: string;
  size?: number;
};

export const CheckIcon: React.FC<Props> = ({ className, title, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? "img" : "presentation"}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    <path
      d="M20.285 5.709a1 1 0 0 0-1.57-1.25l-8.59 10.784-4.24-4.24a1 1 0 1 0-1.414 1.414l5.04 5.04a1 1 0 0 0 1.485-.074L20.285 5.71Z"
      fill="var(--btn-primary-text)"
    />
  </svg>
);

export default CheckIcon;
