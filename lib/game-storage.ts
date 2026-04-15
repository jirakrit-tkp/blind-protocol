import { randomInt, randomUUID } from "crypto";
import type { Room, RoomLog } from "./types";
import { JOIN_CODE_LENGTH } from "./game-api-constants";
import { normalizeRoom, defaultLobbyTheme } from "./main-room-engine";
import { getServiceSupabase } from "./supabase/service";

const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function randomJoinCode(): string {
  let s = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    s += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)]!;
  }
  return s;
}

export async function allocateJoinCode(): Promise<string> {
  const sb = getServiceSupabase();
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = randomJoinCode();
    const { data } = await sb
      .from("game_rooms")
      .select("id")
      .eq("join_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate a unique join code");
}

export function emptyRoomSnapshot(roomId: string): Room {
  return {
    id: roomId,
    players: [],
    logs: [],
    currentTurn: 0,
    roundIndex: 0,
    phase: "lobby",
    worldState: {},
    lobbyTheme: defaultLobbyTheme(),
    lobbyMode: "imposter",
    votes: {},
  };
}

async function syncPlayerAndLogTables(
  roomId: string,
  room: Room
): Promise<void> {
  const sb = getServiceSupabase();
  await sb.from("game_players").delete().eq("room_id", roomId);
  const playerRows = room.players.map((p, i) => ({
    id: p.id,
    room_id: roomId,
    display_name: p.name,
    role: p.role ?? null,
    sort_order: i,
  }));
  if (playerRows.length > 0) {
    const { error } = await sb.from("game_players").insert(playerRows);
    if (error) console.error("sync game_players", error);
  }

  await sb.from("game_logs").delete().eq("room_id", roomId);
  const logRows = room.logs.map((l: RoomLog, i: number) => ({
    room_id: roomId,
    player_label: l.playerId,
    action: l.action,
    narrative: l.narrative ?? null,
    sort_order: i,
  }));
  if (logRows.length > 0) {
    const { error } = await sb.from("game_logs").insert(logRows);
    if (error) console.error("sync game_logs", error);
  }
}

export async function loadGameRoom(
  roomId: string
): Promise<{ room: Room; rev: number; joinCode: string } | null> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("game_rooms")
    .select("id,join_code,snapshot,rev")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !data) return null;
  const room = normalizeRoom(data.snapshot, data.id);
  room.id = data.id;
  return {
    room,
    rev: typeof data.rev === "number" ? data.rev : Number(data.rev),
    joinCode: data.join_code,
  };
}

export async function findRoomByJoinCode(
  code: string
): Promise<{ roomId: string; joinCode: string } | null> {
  const normalized = normalizeJoinCode(code);
  if (normalized.length !== JOIN_CODE_LENGTH) return null;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("game_rooms")
    .select("id,join_code")
    .eq("join_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return { roomId: data.id, joinCode: data.join_code };
}

export async function saveGameRoomIfUnchanged(
  roomId: string,
  room: Room,
  expectedRev: number
): Promise<boolean> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const nextRev = expectedRev + 1;
  room.id = roomId;

  const { data, error } = await sb
    .from("game_rooms")
    .update({
      snapshot: room,
      rev: nextRev,
      updated_at: now,
    })
    .eq("id", roomId)
    .eq("rev", expectedRev)
    .select("rev")
    .maybeSingle();

  if (error || !data) return false;

  const { error: tickErr } = await sb.from("game_room_ticks").upsert(
    {
      room_id: roomId,
      rev: nextRev,
      updated_at: now,
    },
    { onConflict: "room_id" }
  );
  if (tickErr) {
    console.error("game_room_ticks upsert", tickErr);
    return false;
  }

  await syncPlayerAndLogTables(roomId, room);
  return true;
}

export async function createGameRoomWithHost(displayName: string): Promise<{
  roomId: string;
  joinCode: string;
  playerId: string;
  room: Room;
} | null> {
  const name = displayName.trim();
  if (!name) return null;

  const sb = getServiceSupabase();
  const roomId = randomUUID();
  const joinCode = await allocateJoinCode();
  const playerId = randomUUID();

  const room = emptyRoomSnapshot(roomId);
  room.players.push({ id: playerId, name });

  const now = new Date().toISOString();
  const { error: insErr } = await sb.from("game_rooms").insert({
    id: roomId,
    join_code: joinCode,
    snapshot: room,
    rev: 0,
    created_at: now,
    updated_at: now,
  });
  if (insErr) {
    console.error("createGameRoom", insErr);
    return null;
  }

  const { error: tickErr } = await sb.from("game_room_ticks").insert({
    room_id: roomId,
    rev: 0,
    updated_at: now,
  });
  if (tickErr) {
    console.error("createGameRoom tick", tickErr);
    await sb.from("game_rooms").delete().eq("id", roomId);
    return null;
  }

  await syncPlayerAndLogTables(roomId, room);
  return { roomId, joinCode, playerId, room };
}

export async function deleteGameRoom(roomId: string): Promise<void> {
  const sb = getServiceSupabase();
  await sb.from("game_rooms").delete().eq("id", roomId);
}

export async function mutateGameRoom<T>(
  roomId: string,
  fn: (
    room: Room,
    rev: number
  ) => Promise<
    { ok: true; room: Room; meta?: T } | { ok: false; error: string }
  >
): Promise<{ ok: true; meta?: T } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const loaded = await loadGameRoom(roomId);
    if (!loaded) {
      return {
        ok: false,
        error: "Room not found or database not ready.",
      };
    }
    const out = await fn(loaded.room, loaded.rev);
    if (!out.ok) return { ok: false, error: out.error };
    const saved = await saveGameRoomIfUnchanged(roomId, out.room, loaded.rev);
    if (saved) return { ok: true, meta: out.meta };
  }
  return { ok: false, error: "Server busy — try again." };
}

/** @deprecated Use `mutateGameRoom(roomId, fn)` — same function, old name. */
export const mutateMainRoom = mutateGameRoom;

export function cloneRoom(room: Room): Room {
  return JSON.parse(JSON.stringify(room)) as Room;
}

export { normalizeJoinCode };
