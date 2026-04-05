import GameClient from "./components/GameClient";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen font-sans bg-[#f4f0fc] text-violet-950 dark:bg-[#14101c] dark:text-violet-50">
      <main className="flex flex-1 w-full flex-col items-center justify-center py-8">
        <GameClient />
      </main>
    </div>
  );
}
