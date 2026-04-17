# Blind Protocol

Multiplayer lobby + realtime game UI on [Next.js](https://nextjs.org), backed by [Supabase](https://supabase.com) (Postgres + Realtime). Deploy a single app on **Vercel** — each group uses its **own room** via a short **join code** (no shared passcode).

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (comes with Node)
- A [Supabase](https://supabase.com) project

## Install

```bash
npm install
```

## Supabase setup

1. Create a project in the Supabase dashboard.
2. Open **SQL Editor** and run:
   - `supabase/migrations/20260413130000_multi_room.sql`  
   (If you still have legacy `blind_protocol_*` tables, this migration drops them and creates the multi-room schema.)
3. Under **Database → Replication**, confirm **Realtime** is enabled for **`game_room_ticks`** (the migration adds it to `supabase_realtime`).
4. **Project Settings → API**: copy Project URL, anon/publishable key, and **service_role** secret.

Optional: for **typing indicators** (Realtime Broadcast), adjust Realtime policies if your project restricts broadcast (see [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)).

## Configuration

Copy `.env.example` to `.env` or `.env.local` and fill in values.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (or use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the same value). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — **server only**; used by `/api/game/*`. |

Add any **Ollama / LLM** variables your `lib/ollama.ts` setup expects.

Restart the dev server after changing `NEXT_PUBLIC_*`.

### Test Supabase

With `npm run dev`, open **http://localhost:3000/api/supabase/health** — expect `"ok": true` and `tables.game_rooms` / `game_room_ticks` true.

## Run locally

```bash
npm run dev
```

- **Create room** — you become the first player; share the **6-character code** (or `/?join=CODE`).
- **Join room** — enter code + your name.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production |
| `npm run lint` | ESLint |

## Deploy (Vercel)

Set the same env vars (including `SUPABASE_SERVICE_ROLE_KEY`). Run the migration on the linked Supabase project. Long GM turns: `/api/game/action` uses `maxDuration` — upgrade Vercel plan if timeouts occur.

## Database model

- **`game_rooms`** — one row per room: `join_code`, `snapshot` (full game state JSON), `rev` (optimistic locking).
- **`game_room_ticks`** — one row per room; **Realtime** notifies clients to refetch `GET /api/game/state`.
- **`game_players`** / **`game_logs`** — denormalized copies of players and logs (synced on each save) for SQL/reporting.

## Architecture

- **Next.js** Route Handlers under `app/api/game/*`.
- **HttpOnly cookies** `blind_protocol_room_id` + `blind_protocol_player_id` identify the active session (one room per browser profile at a time).
- **GET /api/game/state** returns role-filtered state for the cookie’s player.
