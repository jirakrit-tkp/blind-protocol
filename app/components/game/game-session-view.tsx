"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import { CharSpinner } from "@/app/components/ui/CharSpinner";
import {
  MissionChainUnlock,
  TypewriterBlock,
  TypingEllipsis,
} from "@/app/components/game/typewriter-ui";
import { MAX_PLAYER_ACTION_LENGTH } from "@/lib/game-limits";
import type { PublicRoomState as RoomState } from "@/lib/public-room-state";
import {
  isMissionWon,
  isSystemProtagonistPlayable,
  SYSTEM_LOG_PLAYER_ID,
} from "@/lib/world-state";

function tallyStats(tallies: { playerId: string; count: number }[] | undefined) {
  const map = new Map<string, number>();
  let max = 0;
  if (tallies) {
    for (const t of tallies) {
      map.set(t.playerId, t.count);
      if (t.count > max) max = t.count;
    }
  }
  return { map, max };
}

function endScreenHeadline(
  mode: "imposter" | "mission",
  role: "imposter" | "normal" | undefined,
  missionSucceeded: boolean | undefined,
  voteCorrect: boolean | undefined
): "win" | "lose" | "gameover" | "unknown" {
  if (mode === "mission") {
    if (missionSucceeded === undefined) return "unknown";
    return missionSucceeded ? "win" : "lose";
  }
  if (!role || missionSucceeded === undefined || voteCorrect === undefined) {
    return "unknown";
  }
  if (role === "normal") {
    if (missionSucceeded && voteCorrect) return "win";
    if (!missionSucceeded && !voteCorrect) return "lose";
    return "gameover";
  }
  if (missionSucceeded && voteCorrect) return "lose";
  if (!missionSucceeded && !voteCorrect) return "win";
  return "gameover";
}

function voteOutcomeSubtitle(
  mode: "imposter" | "mission",
  role: "imposter" | "normal" | undefined,
  missionSucceeded: boolean | undefined,
  voteCorrect: boolean | undefined
): string {
  if (mode === "mission") {
    if (missionSucceeded === undefined) return "This round is over.";
    return missionSucceeded
      ? "Mission completed successfully."
      : "Mission failed.";
  }
  if (!role || missionSucceeded === undefined || voteCorrect === undefined) {
    return "This round is over.";
  }
  const ms = missionSucceeded;
  const vc = voteCorrect;

  if (role === "normal") {
    if (ms && vc) {
      return "Mission succeeded and the crew voted for the real Imposter. Crew wins.";
    }
    if (ms && !vc) {
      return "Mission succeeded, but the vote missed the Imposter. Game over—no clear winner.";
    }
    if (!ms && vc) {
      return "Mission failed even though the crew exposed the Imposter. Game over—no clear winner.";
    }
    return "Mission failed and the vote missed the Imposter. Crew loses.";
  }

  if (ms && vc) {
    return "Mission succeeded, but the crew identified you as the Imposter. You lose.";
  }
  if (ms && !vc) {
    return "Mission succeeded and you stayed hidden from the vote. Game over—no clear winner.";
  }
  if (!ms && vc) {
    return "Mission failed and the crew voted for you. Game over—no clear winner.";
  }
  return "Mission failed and the vote missed you. You win.";
}

const ROLE_COPY: Record<
  "imposter" | "normal",
  { title: string; body: string; className: string }
> = {
  imposter: {
    title: "Imposter",
    body: "Blend in. You may steer the group toward failure.",
    className: "crt-card border-[3px]",
  },
  normal: {
    title: "Crew",
    body: "Help the mission succeed for this scenario.",
    className: "crt-card border-[3px]",
  },
};

export type GameSessionViewProps = {
  roomState: RoomState;
  myPlayerId: string | undefined;
  voteSelectionId: string | null;
  setVoteSelectionId: Dispatch<SetStateAction<string | null>>;
  voteSubmitting: boolean;
  onConfirmVote: () => void;
  actionInput: string;
  setActionInput: Dispatch<SetStateAction<string>>;
  actionSubmitting: boolean;
  onSendAction: () => void;
  flushTypingEmit: (typing: boolean) => void;
  scheduleTypingStop: () => void;
  typingIdleRef: RefObject<ReturnType<typeof setTimeout> | null>;
  rolePanelOpen: boolean;
  setRolePanelOpen: Dispatch<SetStateAction<boolean>>;
  rolePanelContentId: string;
  logScrollContainerRef: RefObject<HTMLDivElement | null>;
  remoteTypingNames: string[];
  beatPending: { actionLine: string; playerId: string } | null;
  gmThinking: boolean;
  onOpenEndGameConfirm: () => void;
};

export function GameSessionView({
  roomState,
  myPlayerId,
  voteSelectionId,
  setVoteSelectionId,
  voteSubmitting,
  onConfirmVote,
  actionInput,
  setActionInput,
  actionSubmitting,
  onSendAction,
  flushTypingEmit,
  scheduleTypingStop,
  typingIdleRef,
  rolePanelOpen,
  setRolePanelOpen,
  rolePanelContentId,
  logScrollContainerRef,
  remoteTypingNames,
  beatPending,
  gmThinking,
  onOpenEndGameConfirm,
}: GameSessionViewProps) {
  const [displayPhase, setDisplayPhase] = useState(roomState.phase);
  const [revealVersion, setRevealVersion] = useState(0);
  const pendingPhaseRef = useRef<RoomState["phase"] | null>(null);
  const revealedNarrationKeysRef = useRef<Set<string>>(new Set());

  const uiPhase = displayPhase;

  const isMyTurn =
    uiPhase === "playing" &&
    roomState.phase === "playing" &&
    isSystemProtagonistPlayable(roomState.worldState) &&
    roomState.players[roomState.currentTurn]?.id === myPlayerId;

  const myRole =
    myPlayerId &&
    (roomState.phase === "playing" ||
      roomState.phase === "voting" ||
      roomState.phase === "end")
      ? roomState.players.find((p) => p.id === myPlayerId)?.role
      : undefined;

  const myPlayerName = myPlayerId
    ? roomState.players.find((p) => p.id === myPlayerId)?.name
    : undefined;

  const logs = roomState.logs;
  const missionOutcomeIdx = useMemo(() => {
    if (!logs?.length) return -1;
    return logs.findIndex(
      (l) =>
        l.playerId === SYSTEM_LOG_PLAYER_ID &&
        l.action === "[MISSION OUTCOME]"
    );
  }, [logs]);

  const [missionChainDone, setMissionChainDone] = useState(false);

  useEffect(() => {
    /* Reset typed-chain unlock when the mission outcome row appears or is removed. */
    /* eslint-disable react-hooks/set-state-in-effect */
    if (missionOutcomeIdx <= 0) {
      setMissionChainDone(true);
    } else {
      setMissionChainDone(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [missionOutcomeIdx]);

  const missionOutcomeUnlocked =
    missionOutcomeIdx <= 0 || missionChainDone;

  const unlockMissionOutcome = useCallback(() => {
    setMissionChainDone(true);
  }, []);

  const latestNarrationKey = useMemo(() => {
    for (let i = roomState.logs.length - 1; i >= 0; i -= 1) {
      const log = roomState.logs[i];
      if (!log?.narrative) continue;
      const isMissionOutcome =
        log.playerId === SYSTEM_LOG_PLAYER_ID &&
        log.action === "[MISSION OUTCOME]";
      if (isMissionOutcome && !missionOutcomeUnlocked) {
        continue;
      }
      return `${i}-${log.playerId}-${log.action}-${log.narrative}`;
    }
    return null;
  }, [roomState.logs, missionOutcomeUnlocked]);

  const latestNarrationRevealed = useMemo(() => {
    if (!latestNarrationKey) return true;
    return revealedNarrationKeysRef.current.has(latestNarrationKey);
  }, [latestNarrationKey, revealVersion]);

  const markNarrationRevealed = useCallback((key: string) => {
    if (revealedNarrationKeysRef.current.has(key)) return;
    revealedNarrationKeysRef.current.add(key);
    setRevealVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (roomState.phase === displayPhase) {
      pendingPhaseRef.current = null;
      return;
    }
    if (latestNarrationRevealed) {
      setDisplayPhase(roomState.phase);
      pendingPhaseRef.current = null;
      return;
    }
    pendingPhaseRef.current = roomState.phase;
  }, [roomState.phase, displayPhase, latestNarrationRevealed]);

  useEffect(() => {
    const pending = pendingPhaseRef.current;
    if (!pending) return;
    if (!latestNarrationRevealed) return;
    setDisplayPhase(pending);
    pendingPhaseRef.current = null;
  }, [latestNarrationRevealed]);

  const prevLogLenForScrollRef = useRef<number | null>(null);
  const prevMissionUnlockedForScrollRef = useRef(false);
  const prevBeatForScrollRef = useRef(false);

  useLayoutEffect(() => {
    const len = roomState.logs?.length ?? 0;
    if (len === 0 && !beatPending) {
      prevLogLenForScrollRef.current = null;
      prevMissionUnlockedForScrollRef.current = false;
      prevBeatForScrollRef.current = false;
      return;
    }

    const unlocked = missionOutcomeUnlocked;
    const prevLen = prevLogLenForScrollRef.current;
    const prevUnlocked = prevMissionUnlockedForScrollRef.current;
    const hasBeat = Boolean(beatPending);
    const prevHasBeat = prevBeatForScrollRef.current;

    const shouldScroll =
      prevLen === null
        ? len > 0 || hasBeat
        : len > prevLen ||
          (!prevUnlocked && unlocked) ||
          (!prevHasBeat && hasBeat);

    prevLogLenForScrollRef.current = len;
    prevMissionUnlockedForScrollRef.current = unlocked;
    prevBeatForScrollRef.current = hasBeat;

    if (!shouldScroll) return;

    const el = logScrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [roomState.logs?.length, missionOutcomeUnlocked, beatPending, logScrollContainerRef]);

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-sm text-zinc-600 dark:text-zinc-400 flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="capitalize">Phase: {uiPhase}</span>
        {uiPhase === "playing" && roomState.players.length > 0 ? (
          <span className="shrink-0 text-right">
            Turn{" "}
            {(roomState.roundIndex ?? 0) * roomState.players.length +
              roomState.currentTurn +
              1}
            /{3 * roomState.players.length}
          </span>
        ) : null}
      </p>

      {myRole &&
      !roomState.voteOutcome &&
      roomState.lobbyMode === "imposter" ? (
        <div
          className={`overflow-hidden rounded-2xl ${ROLE_COPY[myRole].className}`}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/4 dark:hover:bg-white/6"
            onClick={() => setRolePanelOpen((open) => !open)}
            aria-expanded={rolePanelOpen}
            aria-controls={rolePanelContentId}
          >
            <span className="shrink-0 text-[11px] font-bold tracking-wide opacity-75">
              {myPlayerName ? `${myPlayerName}. You are:` : "You are:"}
            </span>
            <span className="min-w-0 flex-1" aria-hidden />
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold opacity-85">
              {rolePanelOpen ? "Hide" : "Show"}
              <svg
                className={`size-4 transition-transform duration-200 ${rolePanelOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </button>
          {rolePanelOpen ? (
            <div
              id={rolePanelContentId}
              className="crt-role-panel-body px-5 pb-5 pt-4 text-center"
            >
              <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {ROLE_COPY[myRole].title}
              </p>
              <p className="mx-auto mt-3 max-w-md text-base font-medium leading-relaxed opacity-90">
                {ROLE_COPY[myRole].body}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {uiPhase === "playing" ? (
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            Current turn
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-950 sm:text-3xl dark:text-violet-50">
            {roomState.players[roomState.currentTurn]?.name ?? "—"}
            {isMyTurn && (
              <span className="text-xl font-semibold text-emerald-700 sm:text-2xl dark:text-emerald-300">
                {" "}
                (you)
              </span>
            )}
          </p>
        </div>
      ) : null}

      <div className="crt-readable-surface rounded-lg border p-3 text-sm">
        {roomState.situation ? (
          <div className="mb-3">
            <p className="mb-1 font-medium">Situation</p>
            <p>
              <TypewriterBlock
                key={roomState.situation}
                text={roomState.situation}
                charDelayMs={8}
              />
            </p>
          </div>
        ) : null}
        <div
          className={
            roomState.situation
              ? "border-t border-(--crt-border) pt-3"
              : ""
          }
        >
          <h2 className="text-base font-semibold">Log</h2>
          {remoteTypingNames.length > 0 ? (
            <p
              className="crt-typing-indicator mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-1">
                <span>{remoteTypingNames.join(", ")}</span>
                <TypingEllipsis />
                <span className="sr-only">typing</span>
              </span>
            </p>
          ) : null}
          <div
            ref={logScrollContainerRef}
            className="mt-2 max-h-48 overflow-y-auto py-1"
          >
            {roomState.logs.length === 0 && !beatPending && !gmThinking ? (
              <p className="opacity-70">No actions yet.</p>
            ) : (
              <>
                {roomState.logs.map((log, i) => {
                  const isMissionOutcome =
                    log.playerId === SYSTEM_LOG_PLAYER_ID &&
                    log.action === "[MISSION OUTCOME]";
                  if (isMissionOutcome) {
                    if (!missionOutcomeUnlocked) return null;
                    const won = isMissionWon(roomState.worldState);
                    return (
                      <div
                        key={`${i}-mission`}
                        className="mb-4 mt-10 w-full last:mb-0 sm:mt-12"
                        role="status"
                      >
                        <p
                          className={`w-full text-center font-medium ${
                            won
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          <TypewriterBlock
                            key={`${i}-mission-${log.narrative ?? "mission"}`}
                            text={log.narrative ?? ""}
                            charDelayMs={10}
                            startDelayMs={550}
                            className="inline-block max-w-full text-center"
                            onRevealComplete={() =>
                              markNarrationRevealed(
                                `${i}-${log.playerId}-${log.action}-${log.narrative ?? ""}`
                              )
                            }
                          />
                        </p>
                      </div>
                    );
                  }
                  const chainFromThis =
                    missionOutcomeIdx > 0 && i === missionOutcomeIdx - 1;
                  return (
                    <div key={i} className="mb-4 last:mb-0">
                      <p className="font-medium">{log.action}</p>
                      {chainFromThis && !log.narrative ? (
                        <MissionChainUnlock onUnlock={unlockMissionOutcome} />
                      ) : null}
                      {log.narrative ? (
                        <div className="mt-1.5">
                          <p className="mb-0.5 text-xs font-semibold">
                            Narration
                          </p>
                          <p className="text-sm opacity-85">
                            <TypewriterBlock
                              key={`${i}-n-${log.narrative}`}
                              text={log.narrative}
                              charDelayMs={10}
                              onRevealComplete={
                                chainFromThis
                                  ? () => {
                                      markNarrationRevealed(
                                        `${i}-${log.playerId}-${log.action}-${log.narrative ?? ""}`
                                      );
                                      unlockMissionOutcome();
                                    }
                                  : () =>
                                      markNarrationRevealed(
                                        `${i}-${log.playerId}-${log.action}-${log.narrative ?? ""}`
                                      )
                              }
                            />
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {beatPending ? (
                  <div className="mb-2">
                    <p className="font-medium">{beatPending.actionLine}</p>
                    {gmThinking ? (
                      <div className="mt-1.5">
                        <p className="mb-0.5 text-xs font-semibold">
                          Narration
                        </p>
                        <p
                          className="text-sm opacity-85 inline-flex min-h-[1.25em] flex-wrap items-baseline gap-x-1.5"
                          aria-live="polite"
                        >
                          <CharSpinner />
                          <span className="sr-only">
                            Generating narration
                          </span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {gmThinking && !beatPending ? (
                  <div className="mb-2">
                    <p className="mb-0.5 text-xs font-semibold">Narration</p>
                    <p
                      className="text-sm opacity-85 inline-flex min-h-[1.25em] flex-wrap items-baseline gap-x-1.5"
                      aria-live="polite"
                    >
                      <CharSpinner />
                      <span className="sr-only">Generating narration</span>
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {uiPhase === "end" && roomState.voteOutcome ? (
        <div className="flex flex-col gap-4">
          {(() => {
            const vo = roomState.voteOutcome;
            if (!vo) return null;
            const r = myPlayerId
              ? roomState.players.find((p) => p.id === myPlayerId)?.role
              : undefined;
            const missionSucceeded =
              vo.missionSucceeded ?? isMissionWon(roomState.worldState);
            const headline = endScreenHeadline(
              roomState.lobbyMode,
              r,
              missionSucceeded,
              vo.crewWon
            );
            const youWin = headline === "win";
            const youLose = headline === "lose";
            return (
              <div
                className="px-6 py-10 text-center"
                role="status"
              >
                <p className="text-4xl font-black tracking-tight sm:text-5xl">
                  {youWin ? "YOU WIN" : youLose ? "YOU LOSE" : "GAME OVER"}
                </p>
                <p className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed opacity-90 sm:text-lg">
                  {voteOutcomeSubtitle(
                    roomState.lobbyMode,
                    r,
                    missionSucceeded,
                    vo.crewWon
                  )}
                </p>
              </div>
            );
          })()}
          {roomState.lobbyMode === "imposter" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {roomState.players.map((p) => {
                const { map: finalMap, max: finalTop } = tallyStats(
                  roomState.voteOutcome?.tally
                );
                const vCount = finalMap.get(p.id) ?? 0;
                const isTopVote = finalTop > 0 && vCount === finalTop;
                return (
                  <div
                    key={p.id}
                    className={`crt-end-tally px-4 py-4 text-center ${
                      isTopVote ? "crt-end-tally--top" : "opacity-85"
                    }`}
                  >
                    <p className="text-lg font-bold">{p.name}</p>
                    <p
                      className={`mt-1 text-sm font-semibold tabular-nums ${
                        isTopVote ? "" : "opacity-70"
                      }`}
                    >
                      {vCount} vote{vCount === 1 ? "" : "s"}
                    </p>
                    <p
                      className={`mt-2 text-sm font-semibold uppercase tracking-wide ${
                        isTopVote ? "" : "opacity-70"
                      }`}
                    >
                      {p.role === "imposter" ? "Imposter" : "Crew"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {uiPhase === "voting" && roomState.players.length > 0 ? (
        <div className="crt-vote-panel rounded-2xl border-2 p-5">
          <h2 className="text-center text-xl font-bold">
            Vote for the Imposter
          </h2>
          {roomState.voteTieInfo ? (
            <div
              className="crt-vote-tie-banner mt-3 px-3 py-3 text-sm"
              role="status"
            >
              <p className="font-bold">Vote tied — vote again.</p>
              <p className="mt-1 text-xs opacity-90">
                Last-round counts are shown on each name below.
              </p>
            </div>
          ) : null}
          <p className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {Object.keys(roomState.votes ?? {}).length}/
            {roomState.players.length} votes — select a player, then confirm
          </p>
          {myPlayerId &&
          roomState.votes &&
          Object.hasOwn(roomState.votes, myPlayerId) ? (
            <p className="mt-3 text-center text-sm font-semibold">
              Your vote:{" "}
              {roomState.players.find(
                (x) => x.id === roomState.votes![myPlayerId]
              )?.name ?? "—"}
            </p>
          ) : null}
          <div
            className="mt-4 grid gap-3 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Choose who you think is the Imposter"
          >
            {roomState.players.map((p) => {
              const hasVoted = Boolean(
                myPlayerId &&
                  roomState.votes &&
                  Object.hasOwn(roomState.votes, myPlayerId)
              );
              const selected = voteSelectionId === p.id;
              const { map: prevTallyMap, max: prevTop } = tallyStats(
                roomState.voteTieInfo?.tallies
              );
              const prevCount = prevTallyMap.get(p.id) ?? 0;
              const prevIsTop =
                Boolean(roomState.voteTieInfo) &&
                prevTop > 0 &&
                prevCount === prevTop;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={hasVoted || voteSubmitting}
                  onClick={() =>
                    setVoteSelectionId((prev) => (prev === p.id ? null : p.id))
                  }
                  className={`crt-vote-target rounded-xl border-2 px-4 py-5 text-center text-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? "crt-vote-target--selected" : ""
                  } ${
                    prevIsTop && !selected ? "crt-vote-target--tie-hint" : ""
                  }`}
                >
                  <span className="block">{p.name}</span>
                  {roomState.voteTieInfo ? (
                    <span className="mt-2 block text-sm font-semibold tabular-nums opacity-90">
                      Last round: {prevCount} vote
                      {prevCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {myPlayerId &&
          roomState.votes &&
          !Object.hasOwn(roomState.votes, myPlayerId) ? (
            <BusyButton
              type="button"
              onClick={onConfirmVote}
              disabled={!voteSelectionId}
              loading={voteSubmitting}
              loadingLabel="Submitting vote…"
              className="crt-btn-cta mt-4 w-full min-h-12 rounded-xl border-2 px-4 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
            >
              Confirm vote
            </BusyButton>
          ) : null}
        </div>
      ) : null}

      {uiPhase === "playing" && (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={actionInput}
              suppressHydrationWarning
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_PLAYER_ACTION_LENGTH);
                setActionInput(v);
                if (isMyTurn && v.trim().length > 0) {
                  flushTypingEmit(true);
                  scheduleTypingStop();
                } else if (isMyTurn && v.trim().length === 0) {
                  if (typingIdleRef.current) {
                    clearTimeout(typingIdleRef.current);
                    typingIdleRef.current = null;
                  }
                  flushTypingEmit(false);
                }
              }}
              onBlur={() => {
                if (typingIdleRef.current) {
                  clearTimeout(typingIdleRef.current);
                  typingIdleRef.current = null;
                }
                flushTypingEmit(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !actionSubmitting) {
                  void onSendAction();
                }
              }}
              placeholder={
                isMyTurn ? "Your action…" : "Waiting for your turn…"
              }
              disabled={!isMyTurn || actionSubmitting}
              maxLength={MAX_PLAYER_ACTION_LENGTH}
              className={`crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 ${
                isMyTurn ? "pl-3 pr-14" : "px-3"
              }`}
              aria-describedby={isMyTurn ? "action-char-count" : undefined}
            />
            {isMyTurn ? (
              <span
                id="action-char-count"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums text-zinc-400 dark:text-zinc-500"
                aria-live="polite"
              >
                {actionInput.length}/{MAX_PLAYER_ACTION_LENGTH}
              </span>
            ) : null}
          </div>
          <BusyButton
            type="button"
            onClick={onSendAction}
            disabled={!isMyTurn || !actionInput.trim()}
            loading={actionSubmitting}
            loadingLabel="Sending…"
            className="crt-btn-cta shrink-0 self-stretch rounded-lg px-4 py-2 font-medium disabled:opacity-50"
          >
            Send
          </BusyButton>
        </div>
      )}

      {uiPhase === "playing" &&
      Object.keys(roomState.worldState ?? {}).length > 0 ? (
        <details className="text-sm text-zinc-700 dark:text-zinc-300">
          <summary className="cursor-pointer text-violet-800 dark:text-violet-300">
            World state
          </summary>
          <pre className="mt-1 p-2 rounded-lg border border-violet-200/60 dark:border-violet-800/40 bg-white/50 dark:bg-violet-950/20 overflow-x-auto">
            {JSON.stringify(roomState.worldState, null, 2)}
          </pre>
        </details>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-violet-200/50 pt-2 dark:border-violet-800/30">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Players
        </span>
        <div className="flex flex-wrap gap-1.5">
          {roomState.players.length === 0 ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              —
            </span>
          ) : (
            roomState.players.map((p) => (
              <div
                key={p.id}
                className="inline-flex items-center rounded-md border border-zinc-200/70 px-1.5 py-0.5 dark:border-zinc-700/40"
              >
                <span className="text-[11px] font-normal leading-tight text-zinc-500 dark:text-zinc-500">
                  {p.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {(uiPhase === "playing" ||
        uiPhase === "voting" ||
        uiPhase === "end") && (
        <div className="flex w-full justify-end border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
          <button
            type="button"
            onClick={onOpenEndGameConfirm}
            className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
          >
            End game
          </button>
        </div>
      )}
    </div>
  );
}

GameSessionView.displayName = "GameSessionView";
