# P2Picks Server

This package exposes an Express server that brokers authenticated traffic between the React client and Supabase. It is responsible for:

- Validating bet proposals and persisting mode configuration safely.
- Coordinating background validators that rely on Redis and filesystem game feeds.
- Issuing user-scoped Supabase clients so Row Level Security (RLS) stays enforced even for privileged operations.

## Environment

Copy `.env.example` to `.env` and set the following variables:

- `SUPABASE_URL` – project URL (e.g. `https://xyzcompany.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY` – **server-only** key with elevated privileges. Never expose this to the client.
- `SUPABASE_ANON_KEY` – public anon key used to mint scoped clients for authenticated users.
- `REDIS_URL` – connection string for Redis (used by the mode validators).

All keys must be present; the server will refuse to start if any are missing.

## Development

```bash
npm install
npm run dev
```

The dev server listens on port `5001` by default. Requests must include a Supabase session token in the `Authorization: Bearer <token>` header.

## Production notes

- Ensure the process receives `SIGTERM` or `SIGINT` so validators can shut down cleanly.
- Restrict network access to the Redis instance so only the server can connect.
- Rotate the service-role key regularly and update the environment.
