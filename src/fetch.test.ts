import { describe, expect, test } from "bun:test";
import { fetchAllData } from "./fetch";

const payload = {
  players: [],
  teams: [],
  heats: [
    { _id: "heat-1", heat: 1 },
    { _id: "heat-3", heat: 3 },
  ],
  timeTypes: [],
  timeLogs: [],
};

describe("fetchAllData", () => {
  test("rejects when STATS_API_KEY is missing", async () => {
    const originalKey = process.env.STATS_API_KEY;
    delete process.env.STATS_API_KEY;

    try {
      await expect(fetchAllData("https://example.convex.cloud")).rejects.toThrow(
        "STATS_API_KEY not set",
      );
    } finally {
      if (originalKey === undefined) delete process.env.STATS_API_KEY;
      else process.env.STATS_API_KEY = originalKey;
    }
  });

  test("sends the configured STATS_API_KEY as a bearer header", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.STATS_API_KEY;
    let requestUrl: string | undefined;
    let requestInit: RequestInit | undefined;
    process.env.STATS_API_KEY = "test-stats-api-key";
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify(payload), { status: 200 });
    };

    try {
      const result = await fetchAllData("https://example.convex.cloud");

      expect(requestUrl).toBe("https://example.convex.cloud/stats");
      expect(requestInit).toEqual({
        headers: { Authorization: "Bearer test-stats-api-key" },
      });
      expect(result.heats.map(({ heat }) => heat)).toEqual([3, 1]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.STATS_API_KEY;
      else process.env.STATS_API_KEY = originalKey;
    }
  });
});
