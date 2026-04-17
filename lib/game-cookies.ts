import type { NextResponse } from "next/server";
import {
  PLAYER_COOKIE,
  ROOM_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "./game-api-constants";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === "production",
};

export function attachGameSessionCookies(
  res: NextResponse,
  roomId: string,
  playerId: string
): void {
  res.cookies.set(ROOM_COOKIE, roomId, cookieBase);
  res.cookies.set(PLAYER_COOKIE, playerId, cookieBase);
}

export function clearGameSessionCookies(res: NextResponse): void {
  const clear = { ...cookieBase, maxAge: 0 };
  res.cookies.set(ROOM_COOKIE, "", clear);
  res.cookies.set(PLAYER_COOKIE, "", clear);
}
