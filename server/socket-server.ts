import { createServer } from "http";
import { Server } from "socket.io";
import type { Room, Player, RoomLog } from "../lib/types";
import { askAI, buildGameMasterPrompt } from "../lib/ollama";

// Global state to avoid re-initialization (Next.js dev hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __rooms: Map<string, Room> | undefined;
}

const rooms = global.__rooms ?? new Map<string, Room>();
if (!global.__rooms) {
  global.__rooms = rooms;
}

const SITUATION =
  "A spaceship crew is trying to repair the engine. They must work together, but one crew member is secretly sabotaging the mission.";

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(id) ? generateRoomId() : id;
}

function getRoomForSocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

function getPlayerFromRoom(room: Room, socketId: string): Player | undefined {
  return room.players.find((p) => p.id === socketId);
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
    phase: room.phase,
  };
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("create_room", () => {
    const roomId = generateRoomId();
    const room: Room = {
      id: roomId,
      players: [],
      logs: [],
      currentTurn: 0,
      phase: "lobby",
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit("room_created", roomId);
  });

  socket.on("join_room", (payload: { roomId: string; name: string }) => {
    const { roomId, name } = payload;
    if (!roomId || !name) return;

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }
    if (room.phase !== "lobby") {
      socket.emit("error", { message: "Game already started" });
      return;
    }

    const player: Player = {
      id: socket.id,
      name: name.trim(),
    };
    room.players.push(player);
    socket.join(roomId);

    const state = getRoomState(room);
    io.to(roomId).emit("room_update", state);
  });

  socket.on("start_game", () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    if (room.phase !== "lobby") return;
    if (room.players.length < 2) {
      socket.emit("error", { message: "Need at least 2 players" });
      return;
    }

    const imposterIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, i) => {
      p.role = i === imposterIndex ? "imposter" : "normal";
    });
    room.phase = "playing";
    room.currentTurn = 0;

    const state = getRoomState(room);
    io.to(room.id).emit("room_update", state);
    io.to(room.id).emit("phase_change", "playing");
    io.to(room.id).emit("turn_change", room.players[0]?.id ?? null);
  });

  socket.on("action", async (payload: { roomId: string; action: string }) => {
    const { roomId, action } = payload;
    if (!roomId || !action) return;

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
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

    const recentActions = room.logs
      .slice(-5)
      .map((l) => `${l.action}${l.narrative ? ` → ${l.narrative}` : ""}`);
    const prompt = buildGameMasterPrompt(
      SITUATION,
      recentActions,
      `${currentPlayer.name}: ${action}`
    );

    let narrative: string;
    try {
      narrative = await askAI(prompt);
    } catch (err) {
      narrative = `[The room trembles. Something goes wrong. Perhaps the AI is offline.]`;
    }

    const log: RoomLog = {
      playerId: socket.id,
      action: `${currentPlayer.name}: ${action}`,
      narrative,
    };
    room.logs.push(log);

    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    const nextPlayer = room.players[room.currentTurn];

    io.to(roomId).emit("new_log", [log]);
    io.to(roomId).emit("room_update", getRoomState(room));
    io.to(roomId).emit("turn_change", nextPlayer?.id ?? null);
  });

  socket.on("vote", (payload: { roomId: string; targetId: string }) => {
    const { roomId, targetId } = payload;
    if (!roomId || !targetId) return;

    const room = rooms.get(roomId);
    if (!room) return;
    if (room.phase !== "voting") return;

    // TODO: implement voting logic (collect votes, determine result)
    io.to(roomId).emit("room_update", getRoomState(room));
  });

  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket.id);
    if (room) {
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(room.id);
      } else {
        io.to(room.id).emit("room_update", getRoomState(room));
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on http://localhost:${PORT}`);
});
