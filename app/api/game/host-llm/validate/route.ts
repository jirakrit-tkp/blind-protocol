import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadGameRoom } from "@/lib/game-storage";
import {
  assertOllamaHostAllowedForFetch,
  isRoomHost,
  isRoomLlmConfigured,
  resolveEffectiveLlmConfig,
} from "@/lib/host-llm-config";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { PLAYER_COOKIE, ROOM_COOKIE } from "@/lib/game-api-constants";

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

async function checkUrl(url: string, init?: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Connection check failed: ${response.status} ${response.statusText}`);
  }
}

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
        { error: "Checks are only allowed in the lobby" },
        { status: 400 }
      );
    }
    if (!isRoomHost(room, playerId)) {
      return NextResponse.json(
        { error: "Only the room host can validate LLM settings" },
        { status: 403 }
      );
    }
    if (!isRoomLlmConfigured(room.hostLlm)) {
      return NextResponse.json(
        { error: "Set AI source first (prepared or custom), then run validation" },
        { status: 400 }
      );
    }

    const effective = resolveEffectiveLlmConfig(room.hostLlm);
    if (!effective) {
      return NextResponse.json(
        { error: "LLM settings are not ready yet" },
        { status: 400 }
      );
    }

    if (effective.provider === "openai") {
      const base = stripTrailingSlashes(effective.openaiBaseUrl.trim());
      const apiKey = effective.openaiApiKey?.trim();
      if (!apiKey) throw new Error("OpenAI API key is missing");
      await checkUrl(`${base}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return NextResponse.json({
        ok: true,
        message: "Endpoint reachable and API key accepted (models listed).",
      });
    }

    if (effective.provider === "gemini") {
      const base = stripTrailingSlashes(effective.geminiBaseUrl.trim());
      const apiKey = effective.geminiApiKey?.trim();
      if (!apiKey) throw new Error("Gemini API key is missing");
      const url = `${base}/models?key=${encodeURIComponent(apiKey)}`;
      await checkUrl(url, { method: "GET" });
      return NextResponse.json({
        ok: true,
        message: "Endpoint reachable and API key accepted (models listed).",
      });
    }

    if (effective.provider === "custom") {
      const base = stripTrailingSlashes(effective.customBaseUrl.trim());
      await checkUrl(base, { method: "GET" });
      return NextResponse.json({
        ok: true,
        message: "Custom base URL is reachable (no completion called).",
      });
    }

    const base = stripTrailingSlashes(effective.ollamaHost.trim());
    const url = `${base}/api/tags`;
    assertOllamaHostAllowedForFetch(url);
    await checkUrl(url, { method: "GET" });
    return NextResponse.json({
      ok: true,
      message: "Ollama endpoint reachable (models listed).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection validation failed";
    console.error("POST /api/game/host-llm/validate", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
