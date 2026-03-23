import { createServer } from "http";
import { Server } from "socket.io";
import type { Room, Player, RoomLog } from "../lib/types";
import {
  askAI,
  buildGameMasterPrompt,
  parseActionResponse,
  generateGameSetup,
} from "../lib/ollama";

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
      missionProgress: 0,
      worldState: {},
    };
    rooms.set(MAIN_ROOM_ID, room);
  }
  return room;
}

function getRoomForSocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

function getRoomState(room: Room) {
  return {
    id: room.id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: room.phase === "lobby" ? undefined : p.role,
    })),
    logs: room.logs,
    currentTurn: room.currentTurn,
    roundIndex: room.roundIndex ?? 0,
    phase: room.phase,
    missionProgress: room.missionProgress,
    worldState: room.worldState,
    situation: room.situation,
  };
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

    const state = getRoomState(room);
    io.to(MAIN_ROOM_ID).emit("room_update", state);
  });

  socket.on("start_game", async (payload: { theme?: string; brief?: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    if (room.phase !== "lobby") return;
    if (room.players.length < 2) {
      socket.emit("error", { message: "Need at least 2 players" });
      return;
    }

    const theme = (payload?.theme ?? "ผจญภัย").trim();
    const brief = payload?.brief?.trim();

    let situation: string;
    let worldState: Record<string, string | number | boolean>;
    try {
      const setup = await generateGameSetup(theme, brief);
      situation = setup.situation;
      worldState = setup.worldState;
    } catch (err) {
      socket.emit("error", { message: "Failed to generate game setup. Is Ollama running?" });
      return;
    }

    const imposterIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, i) => {
      p.role = i === imposterIndex ? "imposter" : "normal";
    });
    room.phase = "playing";
    room.currentTurn = 0;
    room.roundIndex = 0;
    room.missionProgress = 0;
    room.worldState = { protagonist_alive: true, ...worldState };
    room.situation = situation;

    const state = getRoomState(room);
    io.to(room.id).emit("room_update", state);
    io.to(room.id).emit("phase_change", "playing");
    io.to(room.id).emit("turn_change", room.players[0]?.id ?? null);
  });

  socket.on("action", async (payload: { action: string }) => {
    const { action } = payload;
    if (!action) return;

    const room = getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("error", { message: "Not in a room" });
      return;
    }
    if (room.phase !== "playing") {
      socket.emit("error", { message: "Not in playing phase" });
      return;
    }

    const currentPlayer = room.players[room.currentTurn];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit("error", { message: "Not your turn" });
      return;
    }

    const recentActions = room.logs.slice(-5).map((l) => {
      const suggestedAction = l.action.includes(": ") ? l.action.split(": ").slice(1).join(": ").trim() : l.action;
      return `${suggestedAction}${l.narrative ? ` → ${l.narrative}` : ""}`;
    });
    const situation =
      room.situation ??
      "A collaborative story. One shared protagonist. One imposter among the players.";

    const prompt = buildGameMasterPrompt(
      situation,
      recentActions,
      action,
      room.worldState,
      room.missionProgress
    );

    let rawNarrative: string;
    try {
      rawNarrative = await askAI(prompt);
    } catch (err) {
      rawNarrative = `[The room trembles. Something goes wrong. Perhaps the AI is offline.]`;
    }

    const { narrative, progressDelta, stateUpdates, missionPossible } =
      parseActionResponse(rawNarrative);
    Object.assign(room.worldState, stateUpdates);
    room.missionProgress = Math.min(100, room.missionProgress + progressDelta);

    const protagonistDead = room.worldState.protagonist_alive === false;
    const missionImpossible = !missionPossible;

    const log: RoomLog = {
      playerId: socket.id,
      action: `${currentPlayer.name}: ${action}`,
      narrative,
    };
    room.logs.push(log);

    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    const nextPlayer = room.players[room.currentTurn];

    const turnWrappedToZero = room.currentTurn === 0 && room.players.length > 0;
    if (turnWrappedToZero) {
      room.roundIndex = (room.roundIndex ?? 0) + 1;
    }

    const allTurnsUsed = (room.roundIndex ?? 0) >= 3;
    if (room.missionProgress >= 100) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
    } else if (protagonistDead || missionImpossible) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
    } else if (allTurnsUsed) {
      room.phase = "end";
      io.to(room.id).emit("phase_change", "end");
    }

    io.to(room.id).emit("new_log", [log]);
    io.to(room.id).emit("room_update", getRoomState(room));
    io.to(room.id).emit("turn_change", nextPlayer?.id ?? null);
  });

  socket.on("vote", (payload: { targetId: string }) => {
    const { targetId } = payload;
    if (!targetId) return;

    const room = getRoomForSocket(socket.id);
    if (!room) return;
    if (room.phase !== "voting") return;

    // TODO: implement voting logic (collect votes, determine result)
    io.to(room.id).emit("room_update", getRoomState(room));
  });

  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket.id);
    if (room) {
      room.players = room.players.filter((p) => p.id !== socket.id);
      io.to(room.id).emit("room_update", getRoomState(room));
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on http://localhost:${PORT}`);
});
