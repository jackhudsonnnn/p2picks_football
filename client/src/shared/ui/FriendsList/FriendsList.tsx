import React from 'react';
import './FriendsList.css';

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
  /** Called when an action should be executed immediately (e.g. add/remove) */
  onAction?: (userId: string, username: string) => void;
  /** Optional override for action symbol; default handled internally */
  addSymbol?: string;
  removeSymbol?: string;
  variant?: 'add' | 'remove';
  disabled?: boolean;
}

interface StaticProps extends BaseProps {
  mode?: undefined;
}

type FriendsListProps = SelectableProps | StaticProps;

const FriendsList: React.FC<FriendsListProps> = (props) => {
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
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(f.username)}&background=random`}
                alt={f.username}
                className="friend-row-avatar"
              />
              <span className="friend-row-username">{f.username}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const selectable = props as SelectableProps;
  const { selectedIds, onToggle, variant = 'add', disabled } = selectable;
  const selectedSet = selectedIds || new Set<string>();
  const addSymbol = selectable.addSymbol || '✔';
  const removeSymbol = selectable.removeSymbol || '✖';
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
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(f.username)}&background=random`}
                alt={f.username}
                className="friend-row-avatar"
              />
              <span className="friend-row-username">{f.username}</span>
            </div>
            <span
              className={`friend-row-symbol ${isAdd ? 'add' : 'remove'} ${selected ? 'active' : ''}`}
              aria-hidden
            >
              {isAdd ? addSymbol : removeSymbol}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default FriendsList;
