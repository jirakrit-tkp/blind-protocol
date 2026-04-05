import { createServer } from "http";
import { Server } from "socket.io";
import type { Room, Player, RoomLog } from "../lib/types";
import { MAX_PLAYER_ACTION_LENGTH } from "../lib/game-limits";
import { formatLogsForGmPrompt } from "../lib/gm-log-format";
import { runThreeLayerAftermathStep, runThreeLayerPlayerTurn } from "../lib/ollama";
import {
  getThemeLabelsFromScenarioPool,
  pickRandomScenarioFromPool,
} from "../lib/scenario-pool";
import {
  SYSTEM_LOG_PLAYER_ID,
  defaultSystemWorldState,
  isMissionWon,
  isRuleFailed,
  isSystemProtagonistDead,
  isSystemProtagonistPlayable,
} from "../lib/world-state";

// Global state to avoid re-initialization (Next.js dev hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __rooms: Map<string, Room> | undefined;
}

const rooms = global.__rooms ?? new Map<string, Room>();
if (!global.__rooms) {
  global.__rooms = rooms;
}

const MAIN_ROOM_ID = "MAIN";
const GAME_PASSCODE = process.env.GAME_PASSCODE ?? "JourneyToJupiter";

function defaultLobbyTheme(): string {
  const labels = getThemeLabelsFromScenarioPool();
  return labels[0] ?? "";
}

function getOrCreateMainRoom(): Room {
  let room = rooms.get(MAIN_ROOM_ID);
  if (!room) {
    room = {
      id: MAIN_ROOM_ID,
      players: [],
      logs: [],
      currentTurn: 0,
      roundIndex: 0,
      phase: "lobby",
      worldState: {},
      lobbyTheme: defaultLobbyTheme(),
    };
    rooms.set(MAIN_ROOM_ID, room);
  } else if (typeof room.lobbyTheme !== "string") {
    room.lobbyTheme = defaultLobbyTheme();
  }
  return room;
}

function getRoomForSocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

function getRoomState(room: Room, viewerSocketId?: string) {
  return {
    id: room.id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role:
        room.phase === "lobby"
          ? undefined
          : viewerSocketId && p.id === viewerSocketId
            ? p.role
            : undefined,
    })),
    logs: room.logs,
    currentTurn: room.currentTurn,
    roundIndex: room.roundIndex ?? 0,
    phase: room.phase,
    worldState: room.worldState,
    situation: room.situation,
    lobbyTheme: room.lobbyTheme,
  };
}

function emitRoomUpdate(io: Server, room: Room) {
  for (const p of room.players) {
    io.to(p.id).emit("room_update", getRoomState(room, p.id));
  }
}

const AFTERMATH_MAX_STEPS = 8;

async function runAftermathNarration(
  io: Server,
  room: Room,
  situation: string
): Promise<void> {
  for (let step = 0; step < AFTERMATH_MAX_STEPS; step++) {
    if (isRuleFailed(room.worldState) || isMissionWon(room.worldState)) return;

    const recentEvents = formatLogsForGmPrompt(room.logs);

    const { narrative, missionPossible, sceneUpdates, outcomeUpdates } =
      await runThreeLayerAftermathStep({
        situation,
        recentEvents,
        worldState: room.worldState,
      });
    Object.assign(room.worldState, sceneUpdates);
    Object.assign(room.worldState, outcomeUpdates);

    const aftermathLog: RoomLog = {
      playerId: SYSTEM_LOG_PLAYER_ID,
      action: "[ระบบ] ต่อเหตุการณ์หลังตัวละครหลักเล่นไม่ได้",
      narrative,
    };
    room.logs.push(aftermathLog);
    io.to(room.id).emit("new_log", [aftermathLog]);
    emitRoomUpdate(io, room);
    io.to(room.id).emit("turn_change", null);

    if (
      isRuleFailed(room.worldState) ||
      isMissionWon(room.worldState) ||
      !missionPossible
    ) {
      return;
    }
  }
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("enter", (payload: { passcode: string; name: string }) => {
    const { passcode, name } = payload;
    if (!passcode || !name) return;

    if (passcode !== GAME_PASSCODE) {
      socket.emit("error", { message: "Invalid passcode" });
      return;
    }

    const room = getOrCreateMainRoom();
    if (room.phase !== "lobby") {
      socket.emit("error", { message: "Game already started" });
      return;
    }

    const player: Player = {
      id: socket.id,
      name: name.trim(),
    };
    room.players.push(player);
    socket.join(MAIN_ROOM_ID);

    emitRoomUpdate(io, room);
  });

  socket.on("set_lobby_theme", (payload: { theme?: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.phase !== "lobby") return;

    const theme = payload?.theme?.trim() ?? "";
    const allowedThemes = new Set(getThemeLabelsFromScenarioPool());
    if (!theme || !allowedThemes.has(theme)) {
      socket.emit("error", { message: "Pick a theme from the list" });
      return;
    }

    room.lobbyTheme = theme;
    emitRoomUpdate(io, room);
  });

  socket.on("start_game", (payload: { theme?: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    if (room.phase !== "lobby") return;
    if (room.players.length < 2) {
      socket.emit("error", { message: "Need at least 2 players" });
      return;
    }

    const allowedThemes = new Set(getThemeLabelsFromScenarioPool());
    const themeFromPayload = payload?.theme?.trim();
    const theme =
      themeFromPayload && allowedThemes.has(themeFromPayload)
        ? themeFromPayload
        : room.lobbyTheme?.trim() ?? "";
    if (!theme || !allowedThemes.has(theme)) {
      socket.emit("error", { message: "Pick a theme from the list" });
      return;
    }

    const fromPool = pickRandomScenarioFromPool(theme);
    if (!fromPool) {
      socket.emit("error", { message: "No scenario available for this theme" });
      return;
    }

    const { situation, worldState } = fromPool;

    const imposterIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, i) => {
      p.role = i === imposterIndex ? "imposter" : "normal";
    });
    room.phase = "playing";
    room.currentTurn = 0;
    room.roundIndex = 0;
    room.worldState = { ...defaultSystemWorldState(), ...worldState };
    room.situation = situation;

    emitRoomUpdate(io, room);
    io.to(room.id).emit("phase_change", "playing");
    io.to(room.id).emit("turn_change", room.players[0]?.id ?? null);
  });

  socket.on("action", async (payload: { action: string }) => {
    const action = payload?.action?.trim() ?? "";
    if (!action) return;
    if (action.length > MAX_PLAYER_ACTION_LENGTH) {
      socket.emit("error", {
        message: `Action exceeds ${MAX_PLAYER_ACTION_LENGTH} characters`,
      });
      return;
    }

    const room = getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("error", { message: "Not in a room" });
      return;
    }
    if (room.phase !== "playing") {
      socket.emit("error", { message: "Not in playing phase" });
      return;
    }

    if (!isSystemProtagonistPlayable(room.worldState)) {
      socket.emit("error", {
        message: "Protagonist cannot act — wait for the story to continue",
      });
      return;
    }

    const currentPlayer = room.players[room.currentTurn];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit("error", { message: "Not your turn" });
      return;
    }

    const recentActions = formatLogsForGmPrompt(room.logs);
    const situation =
      room.situation ??
      "A collaborative story. One shared protagonist. One imposter among the players.";

    io.to(room.id).emit("action_pending", {
      playerId: socket.id,
      actionLine: `${currentPlayer.name}: ${action}`,
    });
    io.to(room.id).emit("gm_thinking", { active: true });
    let narrative: string;
    let missionPossible: boolean;
    let sceneUpdates: Record<string, string | number | boolean>;
    let outcomeUpdates: Record<string, string | number | boolean>;
    try {
      const result = await runThreeLayerPlayerTurn({
        situation,
        recentActions,
        playerAction: action,
        worldState: room.worldState,
      }).finally(() => {
        io.to(room.id).emit("gm_thinking", { active: false });
      });
      narrative = result.narrative;
      missionPossible = result.missionPossible;
      sceneUpdates = result.sceneUpdates;
      outcomeUpdates = result.outcomeUpdates;
    } catch (err) {
      console.error("runThreeLayerPlayerTurn", err);
      io.to(room.id).emit("beat_aborted");
      socket.emit("error", {
        message: "The narrator failed to respond. Try again.",
      });
      return;
    }
    Object.assign(room.worldState, sceneUpdates);
    Object.assign(room.worldState, outcomeUpdates);

    const protagonistUnplayable = isSystemProtagonistDead(room.worldState);
    const missionImpossible = !missionPossible;

    const log: RoomLog = {
      playerId: socket.id,
      action: `${currentPlayer.name}: ${action}`,
      narrative,
    };
    room.logs.push(log);

    if (!protagonistUnplayable) {
      room.currentTurn = (room.currentTurn + 1) % room.players.length;
      if (room.currentTurn === 0 && room.players.length > 0) {
        room.roundIndex = (room.roundIndex ?? 0) + 1;
      }
    }

    const nextPlayer = room.players[room.currentTurn];
    const allTurnsUsed = (room.roundIndex ?? 0) >= 3;

    io.to(room.id).emit("new_log", [log]);
    emitRoomUpdate(io, room);

    if (isRuleFailed(room.worldState)) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
      io.to(room.id).emit("turn_change", null);
    } else if (isMissionWon(room.worldState)) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
      io.to(room.id).emit("turn_change", null);
    } else if (missionImpossible) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
      io.to(room.id).emit("turn_change", null);
    } else if (protagonistUnplayable) {
      io.to(room.id).emit("turn_change", null);
      await runAftermathNarration(io, room, situation);
      room.phase = "end";
      emitRoomUpdate(io, room);
      io.to(room.id).emit("phase_change", "end");
    } else if (allTurnsUsed) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
      io.to(room.id).emit("turn_change", null);
    } else {
      io.to(room.id).emit("turn_change", nextPlayer?.id ?? null);
    }
  });

  socket.on("player_typing", (payload: { typing?: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.phase !== "playing") return;
    const player = room.players.find((p) => p.id === socket.id);
    socket.to(room.id).emit("player_typing", {
      playerId: socket.id,
      name: player?.name ?? "Player",
      typing: Boolean(payload?.typing),
    });
  });

  socket.on("vote", (payload: { targetId: string }) => {
    const { targetId } = payload;
    if (!targetId) return;

    const room = getRoomForSocket(socket.id);
    if (!room) return;
    if (room.phase !== "voting") return;

    // TODO: implement voting logic (collect votes, determine result)
    emitRoomUpdate(io, room);
  });

  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket.id);
    if (room) {
      room.players = room.players.filter((p) => p.id !== socket.id);
      emitRoomUpdate(io, room);
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on http://localhost:${PORT}`);
});
