import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPublicRoomState } from "@/lib/public-room-state";
import { loadGameRoom } from "@/lib/game-storage";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";

export async function GET() {
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
      return NextResponse.json({
        joined: false,
        roomId: undefined,
        joinCode: undefined,
        playerId: undefined,
        state: null,
      });
    }

    const loaded = await loadGameRoom(roomId);
    if (!loaded) {
      return NextResponse.json({
        joined: false,
        roomId: undefined,
        joinCode: undefined,
        playerId: undefined,
        state: null,
      });
    }

    const joined = loaded.room.players.some((p) => p.id === playerId);
    return NextResponse.json({
      joined,
      roomId: joined ? roomId : undefined,
      joinCode: joined ? loaded.joinCode : undefined,
      playerId: joined ? playerId : undefined,
      state: joined ? getPublicRoomState(loaded.room, playerId) : null,
    });
  } catch (e) {
    console.error("GET /api/game/state", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
