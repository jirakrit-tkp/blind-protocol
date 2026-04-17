"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { CharSpinner } from "@/app/components/ui/CharSpinner";

export type BusyButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  loading?: boolean;
  /** Shown next to the spinner while loading (also used for screen readers). */
  loadingLabel: string;
};

export const BusyButton = forwardRef<HTMLButtonElement, BusyButtonProps>(
  function BusyButton(
    {
      loading = false,
      loadingLabel,
      children,
      className,
      disabled,
      type = "button",
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={className}
        disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="sr-only">{loadingLabel}</span>
            <CharSpinner />
            <span aria-hidden>{loadingLabel}</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

BusyButton.displayName = "BusyButton";
