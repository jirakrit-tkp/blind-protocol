"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { BLIND_PROTOCOL_ASCII } from "@/lib/blind-protocol-ascii";

export function BlindProtocolAsciiTitle() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const fitAsciiFont = useCallback(() => {
    const wrap = wrapRef.current;
    const pre = preRef.current;
    if (!wrap || !pre) return;
    /** Padding for rounding / font metrics so UA <pre> scrollbars never appear. */
    const maxW = Math.max(0, wrap.clientWidth - 8);
    if (maxW < 12) return;

    const MIN_PX = 12;
    /** Cap keeps fit stable; layout uses full viewport width via bleed wrapper. */
    const MAX_PX = 128;
    let lo = MIN_PX;
    let hi = MAX_PX;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      wrap.style.setProperty("--ascii-title-font-size", `${mid}px`);
      if (pre.scrollWidth <= maxW) lo = mid;
      else hi = mid;
    }
    let best = Math.max(MIN_PX, Math.floor(lo * 10) / 10);
    wrap.style.setProperty("--ascii-title-font-size", `${best}px`);
    for (let step = 0; step < 40; step++) {
      if (
        pre.scrollWidth <= maxW &&
        pre.scrollHeight <= pre.clientHeight &&
        pre.scrollWidth <= pre.clientWidth
      ) {
        break;
      }
      best = Math.max(MIN_PX, Math.round((best - 0.25) * 100) / 100);
      wrap.style.setProperty("--ascii-title-font-size", `${best}px`);
    }
  }, []);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    fitAsciiFont();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(fitAsciiFont);
    });
    ro.observe(wrap);
    void document.fonts.ready.then(() => {
      requestAnimationFrame(fitAsciiFont);
    });
    return () => ro.disconnect();
  }, [fitAsciiFont]);

  return (
    <>
      <h1 className="crt-title-plain max-w-full px-1 text-center font-mono text-3xl font-semibold leading-snug tracking-normal normal-case sm:text-4xl md:sr-only">
        Blind Protocol
      </h1>
      <div
        ref={wrapRef}
        className="crt-title-ascii-wrap hidden w-full min-w-0 justify-center md:flex"
      >
        <pre
          ref={preRef}
          className="crt-title-ascii inline-block max-w-full min-w-0 text-left"
          aria-hidden
        >
          {BLIND_PROTOCOL_ASCII}
        </pre>
      </div>
    </>
  );
}

BlindProtocolAsciiTitle.displayName = "BlindProtocolAsciiTitle";
