import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteGameRoom, loadGameRoom } from "@/lib/game-storage";
import { handleReset } from "@/lib/main-room-engine";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";
import { clearGameSessionCookies } from "@/lib/game-cookies";

export async function POST() {
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

    const loaded = await loadGameRoom(roomId);
    if (!loaded) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (!loaded.room.players.some((p) => p.id === playerId)) {
      return NextResponse.json({ error: "Not in this room" }, { status: 403 });
    }

    const check = handleReset(loaded.room, playerId);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    await deleteGameRoom(roomId);

    const res = NextResponse.json({ ok: true });
    clearGameSessionCookies(res);
    return res;
  } catch (e) {
    console.error("POST /api/game/reset", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
