import { io } from "socket.io-client";

const defaultSocketUrl = "http://localhost:3001";

function getSocketUrl(): string {
  if (typeof window === "undefined") return "";
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  const url =
    fromEnv && fromEnv.length > 0 ? fromEnv : defaultSocketUrl;
  if (
    process.env.NODE_ENV === "development" &&
    url.includes("localhost") &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    console.warn(
      "[blind-protocol] Socket.IO points at localhost but this page is on another host. " +
        "Browsers block that (loopback / private network). Run a second tunnel on port 3001 " +
        "and set NEXT_PUBLIC_SOCKET_URL to its https URL (see .env.example)."
    );
  }
  return url;
}

export function createSocket() {
  return io(getSocketUrl());
}
