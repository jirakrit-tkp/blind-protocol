import GameClient from "./components/GameClient";

export default function Home() {
  return (
    <div className="flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center overflow-x-hidden bg-background text-foreground">
      <main className="flex min-h-0 min-w-0 flex-1 w-full max-w-full flex-col items-center justify-center py-8">
        <GameClient />
      </main>
    </div>
  );
}
