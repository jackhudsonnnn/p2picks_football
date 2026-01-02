import React from "react";

type Props = {
  className?: string;
  title?: string;
};

export const PlusIcon: React.FC<Props> = ({ className, title }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    width="1em"
    height="1em"
    role={title ? "img" : "presentation"}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export default PlusIcon;
