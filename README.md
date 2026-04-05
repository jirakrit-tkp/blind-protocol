# Blind Protocol

Multiplayer lobby + Socket.IO game UI built with [Next.js](https://nextjs.org).

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (comes with Node)

## Install

```bash
npm install
```

## Configuration

Copy the example env file and edit values as needed:

```bash
copy .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `GAME_PASSCODE` | Room password players enter on the login screen. Used by the Socket.IO server (`npm run socket`). Default in code is `JourneyToJupiter` if unset. |
| `NEXT_PUBLIC_SOCKET_URL` | Public **https** URL of the Socket server when you open the app through a tunnel (see below). If unset, the browser uses `http://localhost:3001`. |

After changing `NEXT_PUBLIC_*` variables, restart the Next.js dev server.

## Run the game (development)

The app has two processes:

- **Next.js** — web UI on [http://localhost:3000](http://localhost:3000)
- **Socket.IO** — realtime server on port **3001**

Start both in one terminal:

```bash
npm run dev:all
```

Or run them separately (two terminals):

```bash
npm run dev
```

```bash
npm run socket
```

Open [http://localhost:3000](http://localhost:3000), enter the passcode (same as `GAME_PASSCODE`) and your display name, then join the lobby.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server only (port 3000) |
| `npm run socket` | Socket.IO server only (port 3001) |
| `npm run dev:all` | Both, via [concurrently](https://www.npmjs.com/package/concurrently) |
| `npm run build` / `npm run start` | Production build and serve (Next only; you still need the socket server running separately for full game behavior) |
| `npm run lint` | ESLint |

## Play with others over the internet (optional)

Browsers block a **public** page from calling `http://localhost:3001`, so you need two HTTPS tunnels (e.g. [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) with [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)):

1. Keep `npm run dev:all` running.
2. Terminal A: `cloudflared tunnel --url http://localhost:3000` — share this URL to open the game.
3. Terminal B: `cloudflared tunnel --url http://localhost:3001` — put its **https** URL in `.env.local` as `NEXT_PUBLIC_SOCKET_URL` (no trailing slash).
4. Restart `npm run dev` (or `dev:all`) so Next picks up the env var.

Quick tunnel URLs change each time you restart `cloudflared`.
