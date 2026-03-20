import { io } from "socket.io-client";

const SOCKET_URL =
  typeof window !== "undefined" ? "http://localhost:3001" : "";

export function createSocket() {
  return io(SOCKET_URL);
}
