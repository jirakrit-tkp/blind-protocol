import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mutateGameRoom } from "@/lib/game-storage";
import { handleSetLobbyMode } from "@/lib/main-room-engine";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Server missing Supabase configuration" },
      { status: 503 }
    );
  }
  try {
    const jar = await cookies();
    const roomId = jar.get(ROOM_COOKIE)?.value;
    const playerId = jar.get(PLAYER_COOKIE)?.value;
    if (!roomId || !playerId) {
      return NextResponse.json({ error: "Not in a room" }, { status: 401 });
    }
    const body = (await req.json()) as { mode?: string };
    const out = await mutateGameRoom(roomId, async (room) => {
      const r = handleSetLobbyMode(room, playerId, body.mode);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, room: r.room };
    });
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/game/set-lobby-mode", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
