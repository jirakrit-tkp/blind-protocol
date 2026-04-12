"use client";

export type GameContentColumnProps = {
  children: React.ReactNode;
};

/** Main game column: fills {@link GameClient} section (same max width as lobby). */
export function GameContentColumn({ children }: GameContentColumnProps) {
  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-5 sm:gap-6">
      {children}
    </div>
  );
}

GameContentColumn.displayName = "GameContentColumn";
