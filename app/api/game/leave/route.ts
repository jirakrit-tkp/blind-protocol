import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteGameRoom,
  loadGameRoom,
  mutateGameRoom,
} from "@/lib/game-storage";
import { handlePlayerLeave } from "@/lib/main-room-engine";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";
import { clearGameSessionCookies } from "@/lib/game-cookies";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    const jar = await cookies();
    const roomId = jar.get(ROOM_COOKIE)?.value;
    const playerId = jar.get(PLAYER_COOKIE)?.value;
    if (!roomId || !playerId) {
      return new NextResponse(null, { status: 204 });
    }

    await mutateGameRoom(roomId, async (room) => {
      const next = handlePlayerLeave(room, playerId);
      return { ok: true, room: next };
    });

    const after = await loadGameRoom(roomId);
    if (after && after.room.players.length === 0) {
      await deleteGameRoom(roomId);
    }

    const res = new NextResponse(null, { status: 204 });
    clearGameSessionCookies(res);
    return res;
  } catch (e) {
    console.error("POST /api/game/leave", e);
    return new NextResponse(null, { status: 204 });
  }
}
