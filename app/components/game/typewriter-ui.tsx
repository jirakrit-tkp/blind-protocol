"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const TYPING_DOT_PHASES = [".", "..", "...", ""] as const;

export function TypingEllipsis() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % TYPING_DOT_PHASES.length);
    }, 350);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono tracking-tight" aria-hidden>
      {TYPING_DOT_PHASES[phase]}
    </span>
  );
}

TypingEllipsis.displayName = "TypingEllipsis";

export type TypewriterBlockProps = {
  text: string;
  charDelayMs?: number;
  /** Extra ms before the first character (default: same as charDelayMs). */
  startDelayMs?: number;
  className?: string;
  /** When false, nothing is rendered (deferred reveal). */
  play?: boolean;
  onRevealComplete?: () => void;
};

export function TypewriterBlock({
  text,
  charDelayMs = 10,
  startDelayMs,
  className,
  play = true,
  onRevealComplete,
}: TypewriterBlockProps) {
  const [n, setN] = useState(0);
  const onCompleteRef = useRef(onRevealComplete);
  const firedRef = useRef(false);

  useLayoutEffect(() => {
    onCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  useLayoutEffect(() => {
    firedRef.current = false;
  }, [text, play]);

  useLayoutEffect(() => {
    if (!play) return;
    if (!text) return;
    let i = 0;
    let id: number | undefined;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      i += 1;
      setN(Math.min(i, text.length));
      if (i < text.length) {
        id = window.setTimeout(run, charDelayMs);
      }
    };
    const firstDelay =
      startDelayMs !== undefined ? startDelayMs : charDelayMs;
    id = window.setTimeout(run, firstDelay);
    return () => {
      cancelled = true;
      if (id !== undefined) clearTimeout(id);
    };
  }, [text, charDelayMs, startDelayMs, play]);

  useEffect(() => {
    if (!play || !text.length) return;
    if (n === text.length && !firedRef.current) {
      firedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [n, text, play]);

  if (!play) return null;

  const visible = text.slice(0, n);
  const showCursor = text.length > 0 && n < text.length;

  return (
    <span className={className}>
      {visible}
      {showCursor ? (
        <span className="crt-typewriter-cursor" aria-hidden />
      ) : null}
    </span>
  );
}

TypewriterBlock.displayName = "TypewriterBlock";

/** When mission outcome follows a log line with action only (no narrative), unlock after paint. */
export type MissionChainUnlockProps = {
  onUnlock: () => void;
};

export function MissionChainUnlock({ onUnlock }: MissionChainUnlockProps) {
  useLayoutEffect(() => {
    onUnlock();
  }, [onUnlock]);
  return null;
}

MissionChainUnlock.displayName = "MissionChainUnlock";
