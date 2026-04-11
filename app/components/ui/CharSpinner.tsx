"use client";

import { useEffect, useState } from "react";

const FRAMES = ["/", "-", "\\", "|"] as const;

export function CharSpinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setI((x) => (x + 1) % FRAMES.length);
    }, 90);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="inline-block min-w-[1ch] text-center font-mono"
      aria-hidden
    >
      {FRAMES[i]}
    </span>
  );
}

CharSpinner.displayName = "CharSpinner";
