import { randomUUID } from "crypto";
import {
  coerceHostLlmFromSnapshot,
  isRoomHost,
  isRoomLlmConfigured,
  mergeHostLlmUpdate,
  type SetHostLlmBody,
} from "./host-llm-config";
import type { Player, Room, RoomLog } from "./types";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PLAYER_ACTION_LENGTH,
} from "./game-limits";
import { formatLogsForGmPrompt } from "./gm-log-format";
import { runThreeLayerAftermathStep, runThreeLayerPlayerTurn } from "./ollama";
import {
  getThemeLabelsFromScenarioPool,
  pickRandomScenarioFromPool,
} from "./scenario-pool";
import {
  CHEAT_CMD_FAIL,
  CHEAT_CMD_SUCCESS,
  NARRATIVE_FORCED_FAIL,
  NARRATIVE_FORCED_SUCCESS,
} from "./mission-cheat-commands";
import {
  SYSTEM_FORCED_OUTCOME,
  SYSTEM_LOG_PLAYER_ID,
  defaultSystemWorldState,
  getMissionOutcomeLine,
  isForcedMissionFail,
  isMissionWon,
  isRuleFailed,
  isSystemProtagonistDead,
  isSystemProtagonistPlayable,
} from "./world-state";

export function defaultLobbyTheme(): string {
  const labels = getThemeLabelsFromScenarioPool();
  return labels[0] ?? "";
}

export function normalizeRoom(raw: unknown, roomId: string): Room {
  const base: Room = {
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
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.players)) {
    base.players = o.players.filter(isPlayerRow);
  }
  if (Array.isArray(o.logs)) {
    base.logs = o.logs.filter(isLogRow);
  }
  if (typeof o.currentTurn === "number" && Number.isFinite(o.currentTurn)) {
    base.currentTurn = o.currentTurn;
  }
  if (typeof o.roundIndex === "number" && Number.isFinite(o.roundIndex)) {
    base.roundIndex = o.roundIndex;
  }
  if (
    o.phase === "lobby" ||
    o.phase === "playing" ||
    o.phase === "voting" ||
    o.phase === "end"
  ) {
    base.phase = o.phase;
  }
  if (o.worldState && typeof o.worldState === "object") {
    base.worldState = o.worldState as Room["worldState"];
  }
  if (typeof o.situation === "string") base.situation = o.situation;
  if (typeof o.lobbyTheme === "string" && o.lobbyTheme.trim()) {
    base.lobbyTheme = o.lobbyTheme;
  } else if (typeof o.lobbyTheme !== "string" || !o.lobbyTheme.trim()) {
    base.lobbyTheme = defaultLobbyTheme();
  }
  if (o.lobbyMode === "imposter" || o.lobbyMode === "mission") {
    base.lobbyMode = o.lobbyMode;
  }
  if (o.votes && typeof o.votes === "object") {
    base.votes = { ...(o.votes as Record<string, string>) };
  }
  if (o.voteTieInfo && typeof o.voteTieInfo === "object") {
    base.voteTieInfo = o.voteTieInfo as Room["voteTieInfo"];
  }
  if (o.voteOutcome && typeof o.voteOutcome === "object") {
    base.voteOutcome = o.voteOutcome as Room["voteOutcome"];
  }
  const hostLlm = coerceHostLlmFromSnapshot(o.hostLlm);
  if (hostLlm) base.hostLlm = hostLlm;
  base.id = roomId;
  return base;
}

function isPlayerRow(x: unknown): x is Player {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string";
}

function isLogRow(x: unknown): x is RoomLog {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return typeof l.playerId === "string" && typeof l.action === "string";
}

function getRoomForPlayer(room: Room, playerId: string): Room | null {
  return room.players.some((p) => p.id === playerId) ? room : null;
}

function pushMissionOutcomeAndEnterVoting(room: Room): void {
  const line = getMissionOutcomeLine(room.worldState);
  const outcomeLog: RoomLog = {
    playerId: SYSTEM_LOG_PLAYER_ID,
    action: "[MISSION OUTCOME]",
    narrative: line,
  };
  room.logs.push(outcomeLog);
  if (room.lobbyMode === "mission") {
    const missionSucceeded = isMissionWon(room.worldState);
    room.voteTieInfo = undefined;
    room.voteOutcome = {
      accusedId: "",
      imposterId: "",
      crewWon: missionSucceeded,
      missionSucceeded,
      tally: [],
    };
    room.phase = "end";
    room.votes = {};
    return;
  }
  room.phase = "voting";
  room.votes = {};
  room.voteTieInfo = undefined;
}

const AFTERMATH_MAX_STEPS = 8;

async function runAftermathNarration(room: Room, situation: string): Promise<void> {
  for (let step = 0; step < AFTERMATH_MAX_STEPS; step++) {
    if (isRuleFailed(room.worldState) || isMissionWon(room.worldState)) return;

    const recentEvents = formatLogsForGmPrompt(room.logs);

    const { narrative, missionPossible, sceneUpdates, outcomeUpdates } =
      await runThreeLayerAftermathStep({
        situation,
        recentEvents,
        worldState: room.worldState,
        hostLlm: room.hostLlm,
      });
    Object.assign(room.worldState, sceneUpdates);
    Object.assign(room.worldState, outcomeUpdates);

    const aftermathLog: RoomLog = {
      playerId: SYSTEM_LOG_PLAYER_ID,
      action: "[ระบบ] ต่อเหตุการณ์หลังตัวละครหลักเล่นไม่ได้",
      narrative,
    };
    room.logs.push(aftermathLog);

    if (
      isRuleFailed(room.worldState) ||
      isMissionWon(room.worldState) ||
      !missionPossible
    ) {
      return;
    }
  }
}

function resolveVotingIfComplete(room: Room): boolean {
  if (room.phase !== "voting") return false;
  const playerIds = new Set(room.players.map((p) => p.id));
  const allVoted =
    room.players.length > 0 &&
    room.players.every((p) => {
      const t = room.votes[p.id];
      return typeof t === "string" && playerIds.has(t);
    });
  if (!allVoted) return false;

  const tally = new Map<string, number>();
  for (const p of room.players) {
    const t = room.votes[p.id];
    if (!t || !playerIds.has(t)) continue;
    tally.set(t, (tally.get(t) ?? 0) + 1);
  }

  let max = -1;
  for (const p of room.players) {
    const c = tally.get(p.id) ?? 0;
    if (c > max) max = c;
  }
  const tied = room.players.filter((p) => (tally.get(p.id) ?? 0) === max);

  const talliesSorted = [...room.players]
    .map((p) => ({ playerId: p.id, count: tally.get(p.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  if (tied.length > 1) {
    room.voteTieInfo = {
      tallies: talliesSorted,
      tiedPlayerIds: tied.map((p) => p.id),
    };
    room.votes = {};
    return false;
  }

  const accusedId = tied[0]?.id ?? room.players[0]?.id ?? "";
  const imposter = room.players.find((p) => p.role === "imposter");
  const imposterId = imposter?.id ?? "";
  const crewWon = Boolean(imposterId && accusedId === imposterId);
  const missionSucceeded = isMissionWon(room.worldState);

  room.voteTieInfo = undefined;
  room.voteOutcome = {
    accusedId,
    imposterId,
    crewWon,
    missionSucceeded,
    tally: talliesSorted,
  };
  room.phase = "end";
  room.votes = {};
  return true;
}

export function resetMainRoomToLobby(room: Room): Room {
  room.players = [];
  room.logs = [];
  room.currentTurn = 0;
  room.roundIndex = 0;
  room.phase = "lobby";
  room.worldState = {};
  delete room.situation;
  room.lobbyTheme = defaultLobbyTheme();
  room.lobbyMode = "imposter";
  room.votes = {};
  room.voteOutcome = undefined;
  room.voteTieInfo = undefined;
  return room;
}

export function handleJoin(
  room: Room,
  name: string
): { ok: true; room: Room; playerId: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Name is required" };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
    };
  }
  if (room.phase !== "lobby") {
    return { ok: false, error: "Game already started" };
  }
  const player: Player = {
    id: randomUUID(),
    name: trimmed,
  };
  room.players.push(player);
  return { ok: true, room, playerId: player.id };
}

export function handleRenameLobbySelf(
  room: Room,
  playerId: string,
  rawName: string | undefined
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r || r.phase !== "lobby") {
    return { ok: false, error: "You can only change your name in the lobby" };
  }
  const trimmed = rawName?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, error: "Name is required" };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
    };
  }
  const p = r.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: "Not in a room" };
  p.name = trimmed;
  return { ok: true, room: r };
}

export function handleSetLobbyTheme(
  room: Room,
  playerId: string,
  theme: string | undefined
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r || r.phase !== "lobby") {
    return { ok: false, error: "Not in lobby" };
  }
  const t = theme?.trim() ?? "";
  const allowedThemes = new Set(getThemeLabelsFromScenarioPool());
  if (!t || !allowedThemes.has(t)) {
    return { ok: false, error: "Pick a theme from the list" };
  }
  r.lobbyTheme = t;
  return { ok: true, room: r };
}

export function handleSetLobbyMode(
  room: Room,
  playerId: string,
  mode: string | undefined
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r || r.phase !== "lobby") {
    return { ok: false, error: "Not in lobby" };
  }
  const m = mode?.trim() ?? "";
  if (m !== "imposter" && m !== "mission") {
    return { ok: false, error: "Pick a valid mode" };
  }
  r.lobbyMode = m;
  return { ok: true, room: r };
}

export function handleSetHostLlm(
  room: Room,
  playerId: string,
  body: SetHostLlmBody
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r || r.phase !== "lobby") {
    return {
      ok: false,
      error: "AI settings can only be changed in the lobby before the game starts",
    };
  }
  if (!isRoomHost(r, playerId)) {
    return { ok: false, error: "Only the room host can change AI credentials" };
  }
  const merged = mergeHostLlmUpdate(r.hostLlm, body);
  if (!merged.ok) return { ok: false, error: merged.error };
  r.hostLlm = merged.config;
  return { ok: true, room: r };
}

export function handleStartGame(
  room: Room,
  playerId: string,
  themeFromPayload: string | undefined,
  modeFromPayload: string | undefined
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r) return { ok: false, error: "Not in a room" };
  if (r.phase !== "lobby") return { ok: false, error: "Game already in progress" };
  if (r.players.length < 2) {
    return { ok: false, error: "Need at least 2 players" };
  }

  const allowedThemes = new Set(getThemeLabelsFromScenarioPool());
  const themeFromPayloadTrim = themeFromPayload?.trim();
  const theme =
    themeFromPayloadTrim && allowedThemes.has(themeFromPayloadTrim)
      ? themeFromPayloadTrim
      : r.lobbyTheme?.trim() ?? "";
  if (!theme || !allowedThemes.has(theme)) {
    return { ok: false, error: "Pick a theme from the list" };
  }
  const payloadMode = modeFromPayload?.trim() ?? "";
  const mode =
    payloadMode === "imposter" || payloadMode === "mission"
      ? payloadMode
      : r.lobbyMode;
  if (mode !== "imposter" && mode !== "mission") {
    return { ok: false, error: "Pick a valid mode" };
  }

  if (!isRoomLlmConfigured(r.hostLlm)) {
    return {
      ok: false,
      error:
        "Host must configure AI (gear menu): choose prepared AI or save room credentials before starting.",
    };
  }

  const fromPool = pickRandomScenarioFromPool(theme);
  if (!fromPool) {
    return { ok: false, error: "No scenario available for this theme" };
  }

  const { situation, worldState } = fromPool;

  if (mode === "imposter") {
    const imposterIndex = Math.floor(Math.random() * r.players.length);
    r.players.forEach((p, i) => {
      p.role = i === imposterIndex ? "imposter" : "normal";
    });
  } else {
    r.players.forEach((p) => {
      p.role = "normal";
    });
  }
  r.lobbyMode = mode;
  r.phase = "playing";
  r.currentTurn = 0;
  r.roundIndex = 0;
  r.worldState = { ...defaultSystemWorldState(), ...worldState };
  r.situation = situation;
  r.votes = {};
  r.voteOutcome = undefined;
  r.voteTieInfo = undefined;

  return { ok: true, room: r };
}

export type ActionResult =
  | { ok: true; room: Room }
  | { ok: false; error: string; beatAborted?: boolean };

export async function handlePlayerAction(
  room: Room,
  playerId: string,
  actionRaw: string
): Promise<ActionResult> {
  const action = actionRaw?.trim() ?? "";
  if (!action) return { ok: false, error: "Empty action" };
  if (action.length > MAX_PLAYER_ACTION_LENGTH) {
    return {
      ok: false,
      error: `Action exceeds ${MAX_PLAYER_ACTION_LENGTH} characters`,
    };
  }

  const r = getRoomForPlayer(room, playerId);
  if (!r) return { ok: false, error: "Not in a room" };
  if (r.phase !== "playing") {
    return { ok: false, error: "Not in playing phase" };
  }
  if (!isRoomLlmConfigured(r.hostLlm)) {
    return {
      ok: false,
      error:
        "This room has no LLM configuration. The host must choose prepared AI or set credentials in the lobby before starting.",
    };
  }
  if (!isSystemProtagonistPlayable(r.worldState)) {
    return {
      ok: false,
      error: "Protagonist cannot act — wait for the story to continue",
    };
  }

  const currentPlayer = r.players[r.currentTurn];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  const situation =
    r.situation ??
    "A collaborative story. One shared protagonist. One imposter among the players.";

  const isCheatMission =
    action === CHEAT_CMD_FAIL || action === CHEAT_CMD_SUCCESS;

  let narrative: string;
  let missionPossible: boolean;
  let sceneUpdates: Record<string, string | number | boolean>;
  let outcomeUpdates: Record<string, string | number | boolean>;

  if (isCheatMission) {
    r.worldState[SYSTEM_FORCED_OUTCOME] =
      action === CHEAT_CMD_FAIL ? "fail" : "success";
    narrative =
      action === CHEAT_CMD_FAIL ? NARRATIVE_FORCED_FAIL : NARRATIVE_FORCED_SUCCESS;
    missionPossible = true;
    sceneUpdates = {};
    outcomeUpdates = {};
  } else {
    const recentActions = formatLogsForGmPrompt(r.logs);
    try {
      const result = await runThreeLayerPlayerTurn({
        situation,
        recentActions,
        playerAction: action,
        worldState: r.worldState,
        hostLlm: r.hostLlm,
      });
      narrative = result.narrative;
      missionPossible = result.missionPossible;
      sceneUpdates = result.sceneUpdates;
      outcomeUpdates = result.outcomeUpdates;
    } catch (err) {
      console.error("runThreeLayerPlayerTurn", err);
      return {
        ok: false,
        error: "The narrator failed to respond. Try again.",
        beatAborted: true,
      };
    }
    Object.assign(r.worldState, sceneUpdates);
    Object.assign(r.worldState, outcomeUpdates);
  }

  const protagonistUnplayable = isSystemProtagonistDead(r.worldState);
  const missionImpossible = !missionPossible;

  const log: RoomLog = {
    playerId,
    action: `${currentPlayer.name}: ${action}`,
    narrative,
  };
  r.logs.push(log);

  if (!protagonistUnplayable) {
    r.currentTurn = (r.currentTurn + 1) % r.players.length;
    if (r.currentTurn === 0 && r.players.length > 0) {
      r.roundIndex = (r.roundIndex ?? 0) + 1;
    }
  }

  const allTurnsUsed = (r.roundIndex ?? 0) >= 3;

  if (isRuleFailed(r.worldState)) {
    pushMissionOutcomeAndEnterVoting(r);
  } else if (isMissionWon(r.worldState)) {
    pushMissionOutcomeAndEnterVoting(r);
  } else if (isForcedMissionFail(r.worldState)) {
    pushMissionOutcomeAndEnterVoting(r);
  } else if (missionImpossible) {
    pushMissionOutcomeAndEnterVoting(r);
  } else if (protagonistUnplayable) {
    await runAftermathNarration(r, situation);
    pushMissionOutcomeAndEnterVoting(r);
  } else if (allTurnsUsed) {
    pushMissionOutcomeAndEnterVoting(r);
  }

  return { ok: true, room: r };
}

export function handleVote(
  room: Room,
  voterId: string,
  targetId: string
): { ok: true; room: Room } | { ok: false; error: string } {
  const t = targetId.trim();
  if (!t) return { ok: false, error: "Pick someone to vote for" };

  const r = getRoomForPlayer(room, voterId);
  if (!r || r.phase !== "voting") {
    return { ok: false, error: "Not voting now" };
  }
  if (!r.players.some((p) => p.id === voterId)) {
    return { ok: false, error: "Not in a room" };
  }
  if (!r.players.some((p) => p.id === t)) {
    return { ok: false, error: "Invalid vote target" };
  }
  if (r.votes[voterId]) return { ok: false, error: "Already voted" };

  r.votes[voterId] = t;
  resolveVotingIfComplete(r);
  return { ok: true, room: r };
}

export function handleReset(
  room: Room,
  playerId: string
): { ok: true; room: Room } | { ok: false; error: string } {
  const r = getRoomForPlayer(room, playerId);
  if (!r) {
    return { ok: false, error: "Cannot reset" };
  }
  if (!["lobby", "playing", "voting", "end"].includes(r.phase)) {
    return { ok: false, error: "Cannot reset" };
  }
  resetMainRoomToLobby(r);
  return { ok: true, room: r };
}

export function handlePlayerLeave(room: Room, playerId: string): Room {
  const r = getRoomForPlayer(room, playerId);
  if (!r) return room;
  if (r.phase === "voting") {
    r.votes = {};
    r.voteTieInfo = undefined;
  }
  r.players = r.players.filter((p) => p.id !== playerId);
  return r;
}
