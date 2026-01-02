import React from "react";

type Props = {
  className?: string;
  title?: string;
  size?: number;
};

export const RemoveIcon: React.FC<Props> = ({ className, title, size = 20 }) => (
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
      d="m13.414 12 5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293A1 1 0 0 0 5.293 6.707L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12Z"
      fill="#F22525"
    />
  </svg>
);

export default RemoveIcon;
