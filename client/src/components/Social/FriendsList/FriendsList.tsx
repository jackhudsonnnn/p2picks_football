import React from 'react';
import './FriendsList.css';
import { ProfileIcon } from '@shared/widgets/icons/ProfileIcon';
import { AddIcon } from '@shared/widgets/icons/AddIcon';
import { RemoveIcon } from '@shared/widgets/icons/RemoveIcon';

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
                {isAdd ? <AddIcon /> : <RemoveIcon />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
