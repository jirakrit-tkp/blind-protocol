import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPublicRoomState } from "@/lib/public-room-state";
import {
  findRoomByJoinCode,
  loadGameRoom,
  mutateGameRoom,
} from "@/lib/game-storage";
import { handleJoin } from "@/lib/main-room-engine";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";
import { attachGameSessionCookies } from "@/lib/game-cookies";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Server missing Supabase configuration" },
      { status: 503 }
    );
  }
  try {
    const body = (await req.json()) as {
      joinCode?: string;
      displayName?: string;
    };
    const resolved = await findRoomByJoinCode(body.joinCode ?? "");
    if (!resolved) {
      return NextResponse.json(
        { error: "No room with that code" },
        { status: 404 }
      );
    }
    const { roomId } = resolved;
    const jar = await cookies();
    const existingRoom = jar.get(ROOM_COOKIE)?.value;
    const existingPlayer = jar.get(PLAYER_COOKIE)?.value;

    if (existingRoom === roomId && existingPlayer) {
      const loaded = await loadGameRoom(roomId);
      if (
        loaded &&
        loaded.room.players.some((p) => p.id === existingPlayer)
      ) {
        const res = NextResponse.json({
          ok: true,
          roomId,
          joinCode: loaded.joinCode,
          playerId: existingPlayer,
          alreadyJoined: true,
          state: getPublicRoomState(loaded.room, existingPlayer),
        });
        attachGameSessionCookies(res, roomId, existingPlayer);
        return res;
      }
    }

    const out = await mutateGameRoom(roomId, async (room) => {
      const r = handleJoin(room, body.displayName ?? "");
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        room: r.room,
        meta: { playerId: r.playerId },
      };
    });

    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 400 });
    }

    const playerId = out.meta?.playerId;
    if (!playerId) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const after = await loadGameRoom(roomId);
    const state = after
      ? getPublicRoomState(after.room, playerId)
      : null;

    const res = NextResponse.json({
      ok: true,
      roomId,
      joinCode: after?.joinCode ?? resolved.joinCode,
      playerId,
      state,
    });
    attachGameSessionCookies(res, roomId, playerId);
    return res;
  } catch (e) {
    console.error("POST /api/game/rooms/join", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
