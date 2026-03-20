export type Player = {
  id: string;
  name: string;
  role?: "imposter" | "normal";
};

export type RoomLog = {
  playerId: string;
  action: string;
  narrative?: string;
};

export type Room = {
  id: string;
  players: Player[];
  logs: RoomLog[];
  currentTurn: number;
  phase: "lobby" | "playing" | "voting" | "end";
};
