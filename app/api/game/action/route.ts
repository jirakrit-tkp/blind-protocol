import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  cloneRoom,
  loadGameRoom,
  saveGameRoomIfUnchanged,
} from "@/lib/game-storage";
import { handlePlayerAction } from "@/lib/main-room-engine";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";

/** Ollama / multi-layer GM can exceed default Vercel limits — raise on Pro if needed. */
export const maxDuration = 120;

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
      return NextResponse.json({ error: "Not joined" }, { status: 401 });
    }
    const body = (await req.json()) as { action?: string };
    const loaded = await loadGameRoom(roomId);
    if (!loaded) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 503 }
      );
    }
    if (!loaded.room.players.some((p) => p.id === playerId)) {
      return NextResponse.json({ error: "Not in a room" }, { status: 403 });
    }

    const working = cloneRoom(loaded.room);
    const result = await handlePlayerAction(working, playerId, body.action ?? "");
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          beatAborted: Boolean(result.beatAborted),
        },
        { status: result.beatAborted ? 503 : 400 }
      );
    }

    const saved = await saveGameRoomIfUnchanged(roomId, result.room, loaded.rev);
    if (!saved) {
      return NextResponse.json(
        {
          error:
            "Another move was saved first — the room changed. Please try again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/game/action", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
