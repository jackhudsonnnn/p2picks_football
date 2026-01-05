import React from 'react';
import './UserList.css';
import { ProfileIcon } from '@shared/widgets/icons/ProfileIcon/ProfileIcon';

/**
 * Represents a user item in the list.
 */
export interface UserItem {
  id: string;
  username: string;
  avatar?: string;
}

/**
 * Props passed to the ActionComponent for each user.
 */
export interface UserActionProps {
  user: UserItem;
  disabled?: boolean;
}

interface UserListProps {
  /** Array of users to display */
  users: UserItem[];
  /** Component to render for each user's action area */
  ActionComponent?: React.ComponentType<UserActionProps>;
  /** Click handler for the entire row (row is clickable when provided) */
  onRowClick?: (user: UserItem) => void;
  /** Message to show when list is empty */
  emptyMessage?: string;
  /** Message to show when loading */
  loadingMessage?: string;
  /** Whether the list is in a loading state */
  loading?: boolean;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

export const UserList: React.FC<UserListProps> = ({
  users,
  ActionComponent,
  onRowClick,
  emptyMessage = 'No users found.',
  loadingMessage = 'Loading...',
  loading = false,
  disabled = false,
  className = '',
  style,
}) => {
  if (loading) {
    return (
      <div className={`user-list empty ${className}`} style={style}>
        {loadingMessage}
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className={`user-list empty ${className}`} style={style}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`user-list ${className}`} style={style}>
      {users.map((user) => {
        const clickable = Boolean(onRowClick);
        const handleRowClick = () => {
          if (disabled || loading) return;
          onRowClick?.(user);
        };

        return (
          <button
            key={user.id}
            type="button"
            className={`user-row${clickable ? ' clickable' : ''}`}
            onClick={handleRowClick}
            disabled={disabled || loading}
          >
            <div className="user-row-info">
              <ProfileIcon
                className="user-avatar"
                name={user.username}
                ariaLabel={`Avatar for ${user.username}`}
              />
              <span className="user-row-username">{user.username}</span>
            </div>
            {ActionComponent && (
              <div
                className="user-row-action"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <ActionComponent user={user} disabled={disabled} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
