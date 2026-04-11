import { NextResponse } from "next/server";
import {
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/service";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browser";

type HealthBody = {
  ok: boolean;
  step?: string;
  message?: string;
  code?: string;
  tables?: { game_rooms: boolean; game_room_ticks: boolean };
  browserEnvOk: boolean;
  hint?: string;
};

/**
 * GET /api/supabase/health — verify env + core tables (service role).
 */
export async function GET() {
  const browserEnvOk = isBrowserSupabaseConfigured();

  if (!isSupabaseConfigured()) {
    const body: HealthBody = {
      ok: false,
      step: "env",
      message:
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server).",
      browserEnvOk,
      hint: browserEnvOk
        ? undefined
        : "Also set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for Realtime in the browser.",
    };
    return NextResponse.json(body, { status: 503 });
  }

  try {
    const sb = getServiceSupabase();

    const { error: roomsErr } = await sb.from("game_rooms").select("id").limit(1);
    const { error: ticksErr } = await sb
      .from("game_room_ticks")
      .select("room_id")
      .limit(1);

    const gameRoomsOk = !roomsErr;
    const gameTicksOk = !ticksErr;

    if (!gameRoomsOk || !gameTicksOk) {
      const body: HealthBody = {
        ok: false,
        step: "schema",
        message:
          roomsErr?.message ??
          ticksErr?.message ??
          "Missing game_rooms or game_room_ticks",
        code: roomsErr?.code ?? ticksErr?.code,
        tables: { game_rooms: gameRoomsOk, game_room_ticks: gameTicksOk },
        browserEnvOk,
        hint: "Run supabase/migrations/20260413130000_multi_room.sql in the SQL Editor.",
      };
      return NextResponse.json(body, { status: 503 });
    }

    const body: HealthBody = {
      ok: true,
      tables: { game_rooms: true, game_room_ticks: true },
      browserEnvOk,
      hint: browserEnvOk
        ? undefined
        : "Realtime in the app needs NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: HealthBody = {
      ok: false,
      step: "exception",
      message: e instanceof Error ? e.message : String(e),
      browserEnvOk,
    };
    return NextResponse.json(body, { status: 500 });
  }
}
