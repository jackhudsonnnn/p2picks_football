import React from 'react';
import './FriendsList.css';
import { ProfileIcon } from '@shared/widgets/icons/ProfileIcon';

export interface FriendItem {
  user_id: string;
  username: string;
}

interface BaseProps {
  friends: FriendItem[];
  emptyMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface SelectableProps extends BaseProps {
  mode: 'select';
  selectedIds?: Set<string>;
  onToggle?: (userId: string) => void;
  onAction?: (userId: string, username: string) => void;
  variant?: 'add' | 'remove';
  disabled?: boolean;
  hideActionSymbol?: boolean;
}

interface StaticProps extends BaseProps {
  mode?: undefined;
}

type FriendsListProps = SelectableProps | StaticProps;

const AddIconSvg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M20.285 5.709a1 1 0 0 0-1.57-1.25l-8.59 10.784-4.24-4.24a1 1 0 1 0-1.414 1.414l5.04 5.04a1 1 0 0 0 1.485-.074L20.285 5.71Z"
      fill="#0FBD46"
    />
  </svg>
);

const RemoveIconSvg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="m13.414 12 5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293A1 1 0 0 0 5.293 6.707L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12Z"
      fill="#F22525"
    />
  </svg>
);

export const FriendsList: React.FC<FriendsListProps> = (props) => {
  const {
    friends,
    emptyMessage = 'No friends found.',
    className = '',
    style,
  } = props;

  if (!friends.length) {
    return <div className={`friends-list-shared empty ${className}`} style={style}>{emptyMessage}</div>;
  }

  if (!('mode' in props)) {
    return (
      <div className={`friends-list-shared ${className}`} style={style}>
        {friends.map(f => (
          <div key={f.user_id} className="friend-row">
            <div className="friend-row-info">
              <ProfileIcon className="member-avatar" name={f.username} ariaLabel={`Avatar for ${f.username}`} />
              <span className="friend-row-username">{f.username}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const selectable = props as SelectableProps;
  const { selectedIds, onToggle, variant = 'add', disabled, hideActionSymbol } = selectable;
  const selectedSet = selectedIds || new Set<string>();
  const isAdd = variant === 'add';

  return (
    <div className={`friends-list-shared selectable ${className}`} style={style}>
      {friends.map(f => {
  const selected = selectedSet.has(f.user_id);
        return (
      <button
            key={f.user_id}
            type="button"
            className={`friend-row action ${selected ? 'selected' : ''}`}
            onClick={() => selectable.onAction ? selectable.onAction(f.user_id, f.username) : onToggle?.(f.user_id)}
            disabled={disabled}
            aria-pressed={selected}
          >
            <div className="friend-row-info">
              <ProfileIcon className="member-avatar" name={f.username} ariaLabel={`Avatar for ${f.username}`} />
              <span className="friend-row-username">{f.username}</span>
            </div>
            {!hideActionSymbol && (
              <span
                className={`friend-row-symbol ${isAdd ? 'add' : 'remove'} ${selected ? 'active' : ''}`}
                aria-hidden
              >
                {isAdd ? <AddIconSvg /> : <RemoveIconSvg />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
