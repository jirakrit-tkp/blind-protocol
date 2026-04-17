"use client";

import type { KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";

export type LobbyThemePickerProps = {
  labels: readonly string[];
  value: string;
  onSelect: (theme: string) => void;
  buttonClassName: string;
  uppercaseLabels?: boolean;
  /** True while the parent is saving the theme to the server. */
  isApplying?: boolean;
  "aria-labelledby"?: string;
  /** Accessible name when not using aria-labelledby (default: scenario theme). */
  buttonAriaLabel?: string;
};

export function LobbyThemePicker({
  labels,
  value,
  onSelect,
  buttonClassName,
  uppercaseLabels = false,
  isApplying = false,
  "aria-labelledby": ariaLabelledBy,
  buttonAriaLabel = "Scenario theme",
}: LobbyThemePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const clampIndex = useCallback(
    (i: number) => Math.min(Math.max(0, i), labels.length - 1),
    [labels.length]
  );

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const idx = labels.indexOf(value);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [labels, value]);

  useEffect(() => {
    if (isApplying) setOpen(false);
  }, [isApplying]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-theme-option="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const pick = (theme: string) => {
    onSelect(theme);
    closeMenu();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (isApplying) return;
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else setHighlight((h) => clampIndex(h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openMenu();
      else setHighlight((h) => clampIndex(h - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) pick(labels[highlight] ?? value);
      else openMenu();
    }
  };

  const chevron = (
    <svg
      className={`size-5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
  );

  return (
    <div className="relative w-full" ref={rootRef}>
      <BusyButton
        type="button"
        className={`${buttonClassName} flex w-full cursor-pointer items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open && !isApplying}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabelledBy ? undefined : buttonAriaLabel}
        aria-activedescendant={
          open && !isApplying ? `${listId}-opt-${highlight}` : undefined
        }
        onClick={() => {
          if (isApplying) return;
          open ? closeMenu() : openMenu();
        }}
        onKeyDown={onButtonKeyDown}
        loading={isApplying}
        loadingLabel="Updating theme…"
      >
        <span
          className={`min-w-0 truncate ${uppercaseLabels ? "uppercase tracking-wide" : ""}`}
        >
          {value}
        </span>
        {chevron}
      </BusyButton>
      {open && !isApplying ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="crt-card absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border-2 py-1 backdrop-blur-sm"
        >
          {labels.map((label, i) => {
            const selected = label === value;
            return (
              <div
                key={label}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                data-theme-option={i}
                className={`mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent! px-3 py-2.5 text-left text-sm transition-colors hover:border-(--crt-soft)! hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)] select-none ${
                  selected ? "font-semibold" : "font-medium"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(label);
                }}
                onClick={() => pick(label)}
              >
                <span
                  className={`min-w-0 truncate ${uppercaseLabels ? "uppercase tracking-wide" : ""}`}
                >
                  {label}
                </span>
                {selected ? (
                  <svg
                    className="size-4 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

LobbyThemePicker.displayName = "LobbyThemePicker";
