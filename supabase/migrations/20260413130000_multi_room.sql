-- Multi-room game: remove legacy single-room tables (CASCADE drops publication refs).
DROP TABLE IF EXISTS public.blind_protocol_tick CASCADE;
DROP TABLE IF EXISTS public.blind_protocol_room CASCADE;

-- One row per game session; snapshot is authoritative for the game engine.
CREATE TABLE public.game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL,
  rev bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

-- Denormalized players (synced from snapshot on each save).
CREATE TABLE public.game_players (
  id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES public.game_rooms (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, id)
);

CREATE INDEX game_players_room_sort ON public.game_players (room_id, sort_order);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- Denormalized log lines (synced from snapshot).
CREATE TABLE public.game_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms (id) ON DELETE CASCADE,
  player_label text NOT NULL,
  action text NOT NULL,
  narrative text,
  sort_order int NOT NULL,
  UNIQUE (room_id, sort_order)
);

CREATE INDEX game_logs_room ON public.game_logs (room_id, sort_order);

ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;

-- Realtime: subscribe with filter room_id=eq.<uuid>.
CREATE TABLE public.game_room_ticks (
  room_id uuid PRIMARY KEY REFERENCES public.game_rooms (id) ON DELETE CASCADE,
  rev bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_room_ticks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read game_room_ticks for realtime"
  ON public.game_room_ticks
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_room_ticks;
