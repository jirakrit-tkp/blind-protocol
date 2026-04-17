import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadGameRoom } from "@/lib/game-storage";
import { isRoomHost, isRoomLlmConfigured } from "@/lib/host-llm-config";
import { completeLlmPrompt } from "@/lib/llm-client";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";

export const maxDuration = 60;

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
      return NextResponse.json({ error: "Not joined" }, { status: 401 });
    }
    const loaded = await loadGameRoom(roomId);
    if (!loaded) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const room = loaded.room;
    if (!room.players.some((p) => p.id === playerId)) {
      return NextResponse.json({ error: "Not in a room" }, { status: 403 });
    }
    if (room.phase !== "lobby") {
      return NextResponse.json(
        { error: "Tests are only allowed in the lobby" },
        { status: 400 }
      );
    }
    if (!isRoomHost(room, playerId)) {
      return NextResponse.json(
        { error: "Only the room host can test LLM credentials" },
        { status: 403 }
      );
    }
    if (!isRoomLlmConfigured(room.hostLlm)) {
      return NextResponse.json(
        { error: "Set AI source first (prepared or custom), then run the test" },
        { status: 400 }
      );
    }

    const reply = await completeLlmPrompt(
      "Reply with exactly one word: OK",
      room.hostLlm,
      "test"
    );
    const trimmed = reply.trim().slice(0, 500);
    return NextResponse.json({ ok: true, replyPreview: trimmed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM test failed";
    console.error("POST /api/game/host-llm/test", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
