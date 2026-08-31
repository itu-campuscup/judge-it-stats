import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTeamProfiles } from "./generate";
import type { StatsData } from "./types";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("team comparison publication", () => {
  test("publishes a discoverable index with canonical radar data", () => {
    const directory = mkdtempSync(join(tmpdir(), "judge-it-stats-"));
    temporaryDirectories.push(directory);
    const data: StatsData = {
      players: [{ _id: "player-1", name: "Ada", _creationTime: 1 }],
      teams: [{ _id: "team-1", name: "Anchors", player_1_id: "player-1", image_url: "https://images.example/anchors.png", _creationTime: 1 }],
      heats: [],
      timeTypes: [],
      timeLogs: [],
    };

    writeTeamProfiles(directory, data, "2026-08-31T16:00:00.000Z");

    const index = JSON.parse(readFileSync(join(directory, "teams", "index.json"), "utf8"));
    expect(index).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-08-31T16:00:00.000Z",
      teams: [{
        teamId: "team-1",
        teamName: "Anchors",
        imageUrl: "https://images.example/anchors.png",
        isOut: false,
        players: [{ playerId: "player-1", playerName: "Ada" }],
        bestTimes: {},
        radarData: [
          { subject: "Beer", performance: 0, fullMark: 100 },
          { subject: "Sail", performance: 0, fullMark: 100 },
          { subject: "Spin", performance: 0, fullMark: 100 },
        ],
      }],
    });
  });
});
