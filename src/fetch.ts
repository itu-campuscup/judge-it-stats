import type { StatsData } from "./types";

export async function fetchAllData(convexUrl: string): Promise<StatsData> {
  const statsApiKey = process.env.STATS_API_KEY;

  if (statsApiKey) {
    const url = `${convexUrl}/stats`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${statsApiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stats API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return {
      ...data,
      heats: data.heats.sort((a: any, b: any) => b.heat - a.heat),
    };
  }

  throw new Error("STATS_API_KEY not set. Set it as env var or in .env.local");
}
