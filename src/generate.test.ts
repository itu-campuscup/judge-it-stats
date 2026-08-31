import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTeamProfiles } from "./generate";
import type { StatsData } from "./types";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("team comparison publication", () => {
  test("publishes every participating team with year-scoped radar data", () => {
    const directory = mkdtempSync(join(tmpdir(), "judge-it-stats-"));
    temporaryDirectories.push(directory);
    const data: StatsData = {
      players: [
        { _id: "player-1", name: "Ada", _creationTime: 1 },
        { _id: "player-2", name: "Grace", _creationTime: 1 },
        { _id: "player-3", name: "Linus", _creationTime: 1 },
      ],
      teams: [
        { _id: "team-1", name: "Anchors", player_1_id: "player-3", image_url: "https://images.example/anchors.png", _creationTime: 1 },
        { _id: "team-2", name: "Retired Sailors", player_1_id: "player-2", is_out: true, _creationTime: 1 },
        { _id: "team-3", name: "No 2025 Entry", player_1_id: "player-3", _creationTime: 1 },
      ],
      heats: [
        { _id: "heat-2024", heat: 1, date: "2024-09-01", is_current: false, _creationTime: 1 },
        { _id: "heat-2025", heat: 1, date: "2025-09-01", is_current: true, _creationTime: 1 },
      ],
      timeTypes: [{ _id: "beer", name: "Beer", time_eng: "Beer", _creationTime: 1 }],
      timeLogs: [
        { _id: "old-start", player_id: "player-1", team_id: "team-1", heat_id: "heat-2024", time_type_id: "beer", time_seconds: 0, time: "2024-09-01T12:00:00.000Z", _creationTime: 1 },
        { _id: "old-end", player_id: "player-1", team_id: "team-1", heat_id: "heat-2024", time_type_id: "beer", time_seconds: 5, time: "2024-09-01T12:00:05.000Z", _creationTime: 1 },
        { _id: "active-start", player_id: "player-1", team_id: "team-1", heat_id: "heat-2025", time_type_id: "beer", time_seconds: 0, time: "2025-09-01T12:00:00.000Z", _creationTime: 1 },
        { _id: "active-end", player_id: "player-1", team_id: "team-1", heat_id: "heat-2025", time_type_id: "beer", time_seconds: 10, time: "2025-09-01T12:00:10.000Z", _creationTime: 1 },
        { _id: "inactive-start", player_id: "player-2", team_id: "team-2", heat_id: "heat-2025", time_type_id: "beer", time_seconds: 0, time: "2025-09-01T12:01:00.000Z", _creationTime: 1 },
        { _id: "inactive-end", player_id: "player-2", team_id: "team-2", heat_id: "heat-2025", time_type_id: "beer", time_seconds: 12, time: "2025-09-01T12:01:12.000Z", _creationTime: 1 },
      ],
    };

    writeTeamProfiles(directory, data, 2025, "2026-08-31T16:00:00.000Z");

    const index = JSON.parse(readFileSync(join(directory, "teams", "2025", "index.json"), "utf8"));
    expect(index.teams.map((team: { teamName: string }) => team.teamName)).toEqual(["Anchors", "Retired Sailors"]);
    expect(index.teams[0]).toMatchObject({
      imageUrl: "https://images.example/anchors.png",
      isOut: false,
      bestTimes: { Beer: 10_000 },
      players: [{ playerId: "player-1", playerName: "Ada" }],
    });
    expect(index.teams[1]).toMatchObject({ isOut: true, bestTimes: { Beer: 12_000 } });
    expect(existsSync(join(directory, "teams", "index.json"))).toBe(false);
  });
});
