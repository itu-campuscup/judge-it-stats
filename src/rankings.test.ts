import { describe, expect, test } from "bun:test";
import { generatePlayerProfiles, generateRankings } from "./rankings";
import type { Heat, Player, Team, TimeEntry, TimeLog, TimeType } from "./types";

const players: Player[] = [
  { _id: "player-1", name: "Ada", _creationTime: 1 },
];
const teams: Team[] = [
  {
    _id: "previous-team",
    name: "Previous Team",
    player_1_id: "player-1",
    image_url: "https://images.example/previous.png",
    _creationTime: 1,
  },
  {
    _id: "current-team",
    name: "Current Team",
    player_1_id: "player-1",
    image_url: "https://images.example/current.png",
    _creationTime: 2,
  },
];
const heats: Heat[] = [
  {
    _id: "previous-heat",
    heat: 1,
    date: "2025-09-10",
    is_current: false,
    _creationTime: 1,
  },
  {
    _id: "current-heat",
    heat: 1,
    date: "2026-09-10",
    is_current: true,
    _creationTime: 1,
  },
];
const timeType: TimeType = {
  _id: "beer",
  name: "Beer",
  time_eng: "Beer",
  _creationTime: 1,
};

describe("player profiles", () => {
  test("uses latest participation rather than the player's previous roster", () => {
    const timeLogs: TimeLog[] = [
      {
        _id: "current-log",
        player_id: "player-1",
        team_id: "current-team",
        heat_id: "current-heat",
        time_type_id: timeType._id,
        time_seconds: 0,
        time: "08:00:00.000",
        _creationTime: 2,
      },
      {
        _id: "previous-log",
        player_id: "player-1",
        team_id: "previous-team",
        heat_id: "previous-heat",
        time_type_id: timeType._id,
        time_seconds: 0,
        time: "20:00:00.000",
        _creationTime: 1,
      },
    ];
    const [profile] = generatePlayerProfiles({
      players, teams, heats, timeTypes: [], timeLogs,
    });

    expect(profile.teamId).toBe("current-team");
  });
});

describe("ranking images", () => {
  test("falls back to the team recorded on the ranked result", () => {
    const entries: TimeEntry[] = [{
      playerId: "player-1",
      teamId: "current-team",
      heatId: "current-heat",
      duration: 5_000,
    }];

    const [ranking] = generateRankings(entries, players, teams, heats, timeType);

    expect(ranking.imageUrl).toBe("https://images.example/current.png");
  });
});
