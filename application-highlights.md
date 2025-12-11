# P2Picks: Application Technical Highlights

This document outlines the key technical decisions, architectural patterns, and engineering highlights of the P2Picks peer-to-peer sports betting platform.

---

## Technology Stack

### Frontend
- **React 18** — Modern component-based UI library with hooks for state management
- **TypeScript** — Static typing across the entire codebase for improved developer experience and reliability
- **Vite** — Lightning-fast build tooling with hot module replacement for efficient development
- **React Router v7** — Client-side routing for seamless single-page application navigation

### Backend
- **Node.js with Express** — RESTful API server handling bet resolution, mode validation, and game data orchestration
- **TypeScript** — Shared type definitions between client and server layers
- **Supabase** — PostgreSQL-based backend-as-a-service providing database, authentication, real-time subscriptions, and row-level security

### Data Pipeline
- **Chokidar** — File system watcher for reactive data processing
- **ESPN API** — Unofficial public API for live NFL game data
- **Redis/ioredis** — Caching layer for high-frequency data access (optional)

---

## Supabase Integration

P2Picks leverages Supabase as its core backend infrastructure, utilizing several of its key features:

### Authentication
The application uses Supabase Auth for secure user authentication, seamlessly integrating with the PostgreSQL database through foreign key relationships to the `users` table.

### Real-Time Subscriptions
Supabase's real-time capabilities power the live chat and bet status updates:

```typescript
export function subscribeToMessages(
  tableId: string,
  onInsert: (payload: { eventType: 'INSERT'; message_id?: string }) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`messages:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `table_id=eq.${tableId}` },
      (payload) => {
        onInsert({ eventType: 'INSERT', message_id: (payload.new as any)?.message_id });
      },
    )
    .subscribe();
  return channel;
}
```

Subscriptions are established for:
- **Table members** — Real-time updates when users join or leave
- **Messages** — Live chat message delivery
- **Bet proposals** — Status changes for active wagers

### Row-Level Security (RLS)
All database tables are protected with granular RLS policies. For example, users can only view participations in tables they belong to:

```sql
-- Users can view participations in their tables or their own
USING ((auth.uid() = user_id) OR is_table_member(table_id, auth.uid()))
```

### Database Triggers & Functions
The bet lifecycle is managed through PostgreSQL triggers that automatically:
- Transition bets from `active` → `pending` → `resolved`/`washed`
- Calculate and distribute payouts to winners
- Emit system messages for bet status changes
- Refund points when bets are washed

---

## Cursor-Based Pagination for Messages

The chat system implements efficient cursor-based pagination, enabling smooth "Load older messages" functionality without offset-based inefficiencies.

### Repository Layer
```typescript
export interface TableFeedCursor {
  postedAt: string;
  messageId: string;
}

export interface TableFeedPage {
  messages: ChatMessage[];
  nextCursor: TableFeedCursor | null;
  hasMore: boolean;
}
```

The query uses a compound cursor (`posted_at`, `message_id`) to ensure deterministic ordering:

```typescript
if (before) {
  const postedAtIso = new Date(before.postedAt).toISOString();
  query = query.or(
    `and(posted_at.lt.${postedAtIso}),and(posted_at.eq.${postedAtIso},message_id.lt.${before.messageId})`,
  );
}
```

### Hook Layer
The `useTableFeed` hook manages state with intelligent merging:
- **Latest messages** are fetched on subscription events without duplicating existing data
- **Older messages** are prepended when the user scrolls up, preserving the cursor for subsequent loads
- Messages are sorted chronologically after merging

---

## Separation of Concerns & Modularization

The codebase follows a clear layered architecture, separating responsibilities across distinct modules:

### Client Architecture
```
client/src/
├── components/     # Reusable UI components
├── data/
│   ├── clients/        # Supabase client configuration
│   ├── repositories/   # Data access layer (CRUD operations)
│   ├── subscriptions/  # Real-time subscription handlers
│   └── types/          # Auto-generated database types
├── features/       # Feature-specific hooks, services, and logic
│   ├── auth/
│   ├── bets/
│   ├── social/
│   └── table/
├── pages/          # Route-level page components
└── shared/
    ├── hooks/      # Cross-feature custom hooks
    ├── types/      # Shared TypeScript interfaces
    ├── utils/      # Utility functions
    └── widgets/    # Generic UI primitives
```

### Server Architecture
```
server/src/
├── controllers/    # HTTP request handlers
├── middleware/     # Express middleware (auth, etc.)
├── modes/
│   ├── modules/        # Individual betting mode implementations
│   │   ├── eitherOr/
│   │   ├── kingOfTheHill/
│   │   ├── totalDisaster/
│   │   └── ...
│   ├── registry.ts     # Mode registration and lookup
│   └── shared/         # Shared types and utilities
├── routes/         # API route definitions
└── services/
    ├── nflData/        # ESPN data ingestion pipeline
    ├── bet/            # Bet-specific business logic
    └── ...             # Lifecycle, validation, announcements
```

### Mode Module Pattern
Each betting mode is implemented as a self-contained module with a consistent interface:

```typescript
// Each mode exports a standardized module
export const MODE_MODULES: ModeModule[] = [
  eitherOrModule,
  kingOfTheHillModule,
  totalDisasterModule,
  giveAndTakeModule,
  chooseTheirFateModule,
  scorcererModule,
  propHuntModule,
];
```

Each module contains:
- `definition.ts` — Mode metadata and configuration schema
- `overview.ts` — User-facing description and rules
- `evaluator.ts` — Win condition evaluation logic
- `validator.ts` — Input validation
- `prepareConfig.ts` — Configuration transformation
- `userConfig.ts` — UI component configuration

---

## Reusable Component Library

### Shared Widgets
The application includes a library of generic, reusable widgets:

| Widget | Purpose |
|--------|---------|
| `Modal` | Accessible overlay dialogs with body scroll lock |
| `PaginationControls` | Navigation controls with customizable formatters |
| `FilterBar` | Multi-select filter dropdown |
| `SearchBar` | Debounced search input |
| `FriendsList` | User relationship display |
| `BetStatus` | Bet state indicator with styling |

Example: The `PaginationControls` widget is reused across Tables, Tickets, and other list views:

```tsx
<PaginationControls
  current={currentPage}
  total={totalPages}
  onPrevious={() => setCurrentPage((p) => Math.max(p - 1, 1))}
  onNext={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
  disablePrevious={currentPage === 1}
  disableNext={currentPage === totalPages}
/>
```

### Component Composition
Larger components are composed from smaller primitives:
- `ChatArea` renders grouped `TextMessage` components
- `BetProposalCard` displays bet details with `BetStatus` indicators
- `TableView` coordinates `Navigation`, `ChatArea`, and `MembersPanel`

---

## Mobile & Desktop Compatibility

### Responsive Design Strategy
The application employs a mobile-first responsive design with multiple breakpoints:

```css
/* Tablet and smaller */
@media (max-width: 768px) {
  .table-card {
    padding: var(--spacing-md);
  }
}

/* Small mobile */
@media (max-width: 550px) {
  .navbar-links { display: none; }
}
```

### `useIsMobile` Hook
A custom hook provides JavaScript-level viewport detection:

```typescript
export function useIsMobile(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
```

This enables conditional rendering and layout adjustments based on device size.

### Key Responsive Components
- **Navbar** — Collapses navigation links into mobile-friendly layouts at smaller breakpoints
- **ChatArea** — Adapts message input and display for touch interactions
- **TicketCard** — Adjusts layout density for mobile viewing
- **PaginationControls** — Scales button sizes and spacing

---

## NFL Data Pipeline

The server implements a robust data ingestion pipeline for live NFL game data:

### Architecture Overview
```
ESPN API  →  Raw JSON  →  Refinement  →  Game Feed  →  Bet Resolution
    ↓            ↓            ↓             ↓
 fetchBoxscore  RAW_DIR   REFINED_DIR   chokidar
```

### ESPN Client
The `espnClient.ts` module handles all HTTP communication with ESPN's public API:

```typescript
const BASE_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl';

export async function getLiveEvents(): Promise<ESPNEvent[]> {
  // Fetches scoreboard for live and upcoming games
}

export async function fetchBoxscore(eventId: string): Promise<unknown | null> {
  // Fetches detailed game summary with player stats
}
```

### Refinement Service
Raw ESPN data is normalized into a clean, structured format (`refinementService.ts`):
- Player stats are extracted and categorized (passing, rushing, receiving, defensive, etc.)
- Team information is standardized
- Missing data is filled with sensible defaults

### File-Based Event System with Chokidar
The `GameFeedService` uses Chokidar to watch for file system changes, enabling a reactive event-driven architecture:

```typescript
this.watcher = chokidar
  .watch(path.join(dir, '*.json'), {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  })
  .on('add', (file) => void this.processFile(path.basename(file, '.json')))
  .on('change', (file) => void this.processFile(path.basename(file, '.json')));
```

Benefits of this approach:
- **Decoupled data ingestion** — The polling service writes files independently of consumers
- **Signature-based deduplication** — Only changed documents trigger downstream updates
- **Replay capability** — Subscribers can receive cached game state on connection
- **Atomic file writes** — Data integrity ensured through temp-file-and-rename pattern

### Atomic File Storage
```typescript
export async function writeJsonAtomic(data: unknown, dir: string, file: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);  // Atomic operation
}
```

---

## Bet Lifecycle Management

### Server-Side Timer Scheduling
The `betLifecycleService` manages bet state transitions with precision:

```typescript
function scheduleBetTransition(betId: string, closeTimeIso: string | null): void {
  const delay = fireAt - Date.now() + FIRE_GRACE_MS;
  const handle = setTimeout(() => {
    void transitionBetToPending(betId);
  }, timeoutDelay);
  scheduledTimers.set(betId, handle);
}
```

Key features:
- **Hydration on startup** — All active bets are loaded and scheduled
- **Catchup cycle** — Periodic sweeps ensure no transitions are missed
- **Grace period** — 250ms buffer accounts for clock drift
- **Deduplication** — In-flight transitions are tracked to prevent race conditions

### Database-Driven Resolution
Once a bet closes, the server evaluates the winning condition using mode-specific evaluators:

```typescript
const module = getModeModule(bet.mode_key);
const result = await module.evaluator({ bet, gameData });
// result: { winningChoice: 'player_123' | 'washed', reason?: string }
```

The `winning_choice` update triggers a cascade of database triggers:
1. `trg_auto_resolve_on_winning_choice` — Sets status to `resolved`
2. `trg_apply_bet_payouts` — Calculates and distributes winnings
3. `trg_create_system_message_on_bet_status_change` — Notifies the Table

---

## TypeScript & Type Safety

### Auto-Generated Database Types
Supabase types are generated from the database schema:

```bash
npm run generate:supabase-types
```

This ensures TypeScript interfaces stay synchronized with the actual database structure, preventing runtime errors from schema mismatches.

### Shared Type Definitions
Common types are defined in shared locations and imported across layers:

```typescript
// shared/types/chat.ts
export interface ChatMessage {
  id: string;
  type: 'chat' | 'system' | 'bet';
  senderUserId: string;
  senderUsername: string;
  text: string;
  timestamp: string;
  tableId: string;
  bet?: BetProposalMessage;
}
```

---

## Conclusion

P2Picks demonstrates a thoughtful approach to full-stack application architecture, leveraging modern tools and patterns to create a responsive, real-time peer-to-peer betting experience. Key engineering highlights include:

- **Supabase integration** for authentication, real-time updates, and secure data access
- **Cursor-based pagination** for efficient message loading
- **Modular mode system** enabling easy addition of new betting types
- **File-based reactive data pipeline** for live NFL statistics
- **Component reusability** through a well-organized widget library
- **Responsive design** supporting both mobile and desktop experiences

The separation of concerns across data, feature, and presentation layers ensures maintainability and scalability as the platform evolves.
