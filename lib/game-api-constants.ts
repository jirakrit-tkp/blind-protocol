/** HttpOnly cookies: active game context (one room at a time per browser). */
export const ROOM_COOKIE = "blind_protocol_room_id";
export const PLAYER_COOKIE = "blind_protocol_player_id";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Client: { roomId, playerId, joinCode? } */
export const GAME_SESSION_STORAGE_KEY = "blind_protocol_game_session";

/** Room join code length (must match server). */
export const JOIN_CODE_LENGTH = 6;
