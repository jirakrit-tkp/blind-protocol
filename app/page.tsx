import GameClient from "./components/GameClient";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full flex-col items-center justify-center py-8">
        <GameClient />
      </main>
    </div>
  );
}
