import './LoadMore.css';

export interface LoadMoreButtonProps {
  label?: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  className?: string;
  buttonClassName?: string;
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
  label = 'Load more',
  loadingLabel = 'Loading…',
  loading = false,
  disabled = false,
  onClick,
  className,
  buttonClassName,
}) => {
  return (
    <div className={classNames('load-more-container', className)}>
      <button
        type="button"
        className={classNames('load-more-button', buttonClassName)}
        disabled={disabled || loading}
        onClick={() => { if (onClick) void onClick(); }}
      >
        {loading ? loadingLabel : label}
      </button>
    </div>
  );
};

export default LoadMoreButton;
