"use client";

import { BusyButton } from "@/app/components/ui/BusyButton";

export type EndGameConfirmDialogProps = {
  open: boolean;
  confirmLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EndGameConfirmDialog({
  open,
  confirmLoading,
  onCancel,
  onConfirm,
}: EndGameConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-confirm-title"
        className="crt-card max-w-sm w-full rounded-2xl border-2 p-5 shadow-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <h2
          id="end-game-confirm-title"
          className="text-base font-semibold uppercase tracking-wide"
        >
          End game?
        </h2>
        <p className="mt-3 text-sm leading-relaxed opacity-90">
          {
            "This will end the session for everyone and return to the lobby."
          }
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-medium"
            onClick={onCancel}
            disabled={confirmLoading}
          >
            Cancel
          </button>
          <BusyButton
            type="button"
            className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
            onClick={onConfirm}
            loading={confirmLoading}
            loadingLabel="Ending game…"
          >
            End game
          </BusyButton>
        </div>
      </div>
    </div>
  );
}

EndGameConfirmDialog.displayName = "EndGameConfirmDialog";
