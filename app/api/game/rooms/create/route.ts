import { NextResponse } from "next/server";
import { getPublicRoomState } from "@/lib/public-room-state";
import { createGameRoomWithHost } from "@/lib/game-storage";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { attachGameSessionCookies } from "@/lib/game-cookies";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Server missing Supabase configuration" },
      { status: 503 }
    );
  }
  try {
    const body = (await req.json()) as { displayName?: string };
    const created = await createGameRoomWithHost(body.displayName ?? "");
    if (!created) {
      return NextResponse.json(
        { error: "Could not create room (invalid name or database error)" },
        { status: 400 }
      );
    }
    const { roomId, joinCode, playerId, room } = created;
    const res = NextResponse.json({
      ok: true,
      roomId,
      joinCode,
      playerId,
      state: getPublicRoomState(room, playerId),
    });
    attachGameSessionCookies(res, roomId, playerId);
    return res;
  } catch (e) {
    console.error("POST /api/game/rooms/create", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
