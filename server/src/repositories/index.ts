/**
 * Repositories barrel export
 *
 * All entity repositories for data access.
 */

// Base
export { BaseRepository, type PaginationOptions, type CursorPaginationOptions, type PaginatedResult, type RepositoryError } from './BaseRepository';

// Entity repositories
export { TableRepository, type Table, type TableWithDetails, type TableCursor, type ListTablesOptions } from './TableRepository';
export { TicketRepository, type Ticket, type TicketWithBet, type TicketCursor, type ListTicketsOptions } from './TicketRepository';
export { FriendRepository, type Friend, type FriendWithUser, type ListFriendsOptions } from './FriendRepository';
export { MessageRepository, type Message, type MessageWithUser, type MessageCursor, type ListMessagesOptions, type CreateMessageInput } from './MessageRepository';
export { UserRepository, type User, type UserProfile } from './UserRepository';
