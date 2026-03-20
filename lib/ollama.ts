export async function askAI(prompt: string): Promise<string> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral",
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}

export function buildGameMasterPrompt(
  situation: string,
  recentActions: string[],
  playerAction: string
): string {
  return `You are a game master.

Rules:
- Never say success or failure explicitly
- Never reveal hidden mechanics
- Only describe what happens in the world

Situation:
${situation}

Recent actions:
${recentActions.length > 0 ? recentActions.join("\n") : "(none yet)"}

Player action:
${playerAction}`;
}
