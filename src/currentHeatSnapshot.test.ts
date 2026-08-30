import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { generate } from "./generate";
import { createCurrentHeatSnapshot } from "./currentHeatSnapshot";
import type { StatsData, TimeLog } from "./types";

const generatedAt = "2026-05-17T12:00:00.000Z";
const heat = {
  _id: "heat-4",
  heat: 4,
  date: "2026-05-17",
  is_current: true,
  _creationTime: 1,
};
const players = [
  { _id: "p-ada", name: "Ada", _creationTime: 1 },
  { _id: "p-ben", name: "Ben", _creationTime: 2 },
  { _id: "p-cid", name: "Cid", _creationTime: 3 },
];
const teams = [
  { _id: "team-a", name: "Anchors", player_1_id: "p-ada", _creationTime: 1 },
  { _id: "team-b", name: "Buoys", player_1_id: "p-ben", _creationTime: 2 },
];
const timeTypes = [
  { _id: "tt-beer", name: "Beer", time_eng: "Beer", _creationTime: 1 },
  { _id: "tt-spin", name: "Spin", time_eng: "Spin", _creationTime: 2 },
  { _id: "tt-sail", name: "Sail", time_eng: "Sail", _creationTime: 3 },
];

function log(
  id: string,
  timeTypeId: string,
  playerId: string,
  time: string,
  teamId?: string,
  timeSeconds = 1,
): TimeLog {
  return {
    _id: id,
    player_id: playerId,
    team_id: teamId,
    heat_id: "heat-4",
    time_type_id: timeTypeId,
    time_seconds: timeSeconds,
    time,
    _creationTime: Number(id.replace(/\D/g, "")) || 1,
  };
}

function data(timeLogs: TimeLog[], current = true): StatsData {
  return {
    players,
    teams,
    heats: [{ ...heat, is_current: current }],
    timeTypes,
    timeLogs,
  };
}

describe("createCurrentHeatSnapshot", () => {
  test("returns a parser-compatible unknown heat and empty activities when no heat is current", () => {
    const snapshot = createCurrentHeatSnapshot(data([], false), generatedAt);

    expect(snapshot.currentHeat).toEqual({ id: "", number: 0, year: 0, date: "", state: "unknown", activeActivity: null });
    expect(snapshot.activities.beer).toEqual({ completed: [], active: [], attemptsStarted: 0, attemptsCompleted: 0 });
    expect(snapshot.activities.spin).toEqual({ completed: [], active: [], attemptsStarted: 0, attemptsCompleted: 0 });
    expect(snapshot.activities.sail).toEqual({ teams: [] });
  });

  test("publishes an empty valid current heat with deterministic metadata", () => {
    const snapshot = createCurrentHeatSnapshot(data([]), generatedAt, "2026-05-17T11:59:58.000Z");

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.generatedAt).toBe(generatedAt);
    expect(snapshot.sourceFetchedAt).toBe("2026-05-17T11:59:58.000Z");
    expect(snapshot.currentHeat).toEqual({
      id: "heat-4",
      number: 4,
      year: 2026,
      date: "2026-05-17",
      state: "running",
      activeActivity: null,
    });
  });

  test("pairs valid Beer and Spin records and counts starts and completions", () => {
    const logs = [
      log("beer-start", "tt-beer", "p-ada", "2026-05-17T11:00:00.000Z", "team-a"),
      log("beer-stop", "tt-beer", "p-ada", "2026-05-17T11:00:04.250Z", "team-a"),
      log("spin-ben-start", "tt-spin", "p-ben", "2026-05-17T11:00:10.000Z", "team-b"),
      log("spin-ben-stop", "tt-spin", "p-ben", "2026-05-17T11:00:12.000Z", "team-b"),
      log("spin-ada-start", "tt-spin", "p-ada", "2026-05-17T11:00:20.000Z", "team-a"),
      log("spin-ada-stop", "tt-spin", "p-ada", "2026-05-17T11:00:21.000Z", "team-a"),
    ];

    const snapshot = createCurrentHeatSnapshot(data(logs), generatedAt);

    expect(snapshot.activities.beer.attemptsStarted).toBe(1);
    expect(snapshot.activities.beer.attemptsCompleted).toBe(1);
    expect(snapshot.activities.beer.completed).toEqual([
      expect.objectContaining({ id: "beer-stop", rank: 1, playerName: "Ada", teamName: "Anchors", durationMs: 4250, formattedTime: "00:04:250" }),
    ]);
    expect(snapshot.activities.spin.attemptsStarted).toBe(2);
    expect(snapshot.activities.spin.attemptsCompleted).toBe(2);
    expect(snapshot.activities.spin.completed.map((result) => [result.id, result.rank])).toEqual([["spin-ada-stop", 1], ["spin-ben-stop", 2]]);
    expect(snapshot.activities.spin.completed[0].rpm).toBeGreaterThan(snapshot.activities.spin.completed[1].rpm!);
    expect(snapshot.activities.spin.completed[0].displayRpmLabel).toBe("600 RPM");
  });

  test("keeps an unmatched valid start active and drops malformed timing", () => {
    const logs = [
      log("active-start", "tt-beer", "p-ada", "2026-05-17T11:59:00.000Z", "team-a"),
      log("bad-timestamp", "tt-beer", "p-ben", "not-a-timestamp", "team-b"),
      log("bad-timing", "tt-beer", "p-cid", "2026-05-17T11:59:02.000Z", "team-a", Number.NaN),
    ];

    const snapshot = createCurrentHeatSnapshot(data(logs), generatedAt);

    expect(snapshot.activities.beer.attemptsStarted).toBe(1);
    expect(snapshot.activities.beer.attemptsCompleted).toBe(0);
    expect(snapshot.activities.beer.active).toEqual([
      { playerId: "p-ada", playerName: "Ada", teamName: "Anchors", startedAt: "2026-05-17T11:59:00.000Z", elapsedMsAtSnapshot: 60000 },
    ]);
    expect(snapshot.currentHeat?.activeActivity).toBe("beer");
  });

  test("groups Sail logs, identifies current players, and marks only the earliest valid sixteenth log finished", () => {
    const sailLogs: TimeLog[] = [];
    for (let index = 0; index < 16; index += 1) {
      sailLogs.push(log(`a-${index + 1}`, "tt-sail", index % 2 ? "p-ben" : "p-ada", `2026-05-17T11:00:${String(index).padStart(2, "0")}.000Z`, "team-a", index + 1));
      sailLogs.push(log(`b-${index + 1}`, "tt-sail", index % 2 ? "p-ada" : "p-ben", `2026-05-17T11:01:${String(index).padStart(2, "0")}.000Z`, "team-b", index + 1));
    }

    const snapshot = createCurrentHeatSnapshot(data(sailLogs), generatedAt);
    const [anchros, buoys] = snapshot.activities.sail.teams;

    expect(anchros).toEqual(expect.objectContaining({ teamId: "team-a", teamName: "Anchors", sailLogCount: 16, handoffCount: 7, completedLegCount: 7, status: "finished", currentPlayerName: "Ben", finishedAt: "2026-05-17T11:00:15.000Z" }));
    expect(anchros.elapsedMsAtSnapshot).toBe(3600000);
    expect(anchros.startedAt).toBe("2026-05-17T11:00:00.000Z");
    expect(snapshot.currentHeat?.activeActivity).toBe("sail");
  });
  test("rejects zero-duration Spin pairs instead of emitting infinite RPM", () => {
    const snapshot = createCurrentHeatSnapshot(data([
      log("spin-zero-start", "tt-spin", "p-ada", "2026-05-17T11:00:00.000Z", "team-a"),
      log("spin-zero-stop", "tt-spin", "p-ada", "2026-05-17T11:00:00.000Z", "team-a"),
    ]), generatedAt);

    expect(snapshot.activities.spin.completed).toEqual([]);
    expect(snapshot.activities.spin.attemptsStarted).toBe(1);
    expect(snapshot.activities.spin.attemptsCompleted).toBe(0);
  });

  test("marks a Sail team with fewer than 16 valid logs as racing", () => {
    const sailLogs = Array.from({ length: 15 }, (_, index) => log(
      `short-${index + 1}`,
      "tt-sail",
      index % 2 ? "p-ben" : "p-ada",
      `2026-05-17T11:02:${String(index).padStart(2, "0")}.000Z`,
      "team-a",
      index + 1,
    ));

    const racer = createCurrentHeatSnapshot(data(sailLogs), generatedAt).activities.sail.teams[0];

    expect(racer).toEqual(expect.objectContaining({ status: "racing", sailLogCount: 15, handoffCount: 7, completedLegCount: 7 }));
    expect(racer.finishedAt).toBeUndefined();
  });
});

test("generate writes a parseable current heat snapshot with one run timestamp", async () => {
  const docsDir = mkdtempSync(`${tmpdir()}/judge-it-stats-`);
  const previousDocsDir = process.env.DOCS_DIR;
  process.env.DOCS_DIR = docsDir;

  try {
    const runGeneratedAt = "2026-05-17T12:00:00.000Z";
    const sourceFetchedAt = "2026-05-17T12:00:01.000Z";
    await generate(data([], true), {
      full: true,
      generatedAt: runGeneratedAt,
      sourceFetchedAt,
    });

    const snapshot = JSON.parse(readFileSync(`${docsDir}/current-heat.json`, "utf8"));
    const index = JSON.parse(readFileSync(`${docsDir}/index.json`, "utf8"));
    const yearSummary = JSON.parse(
      readFileSync(`${docsDir}/rankings/2026/summary.json`, "utf8"),
    );

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.currentHeat).toMatchObject({
      id: "heat-4",
      number: 4,
      year: 2026,
    });
    expect(snapshot.generatedAt).toBe(runGeneratedAt);
    expect(snapshot.sourceFetchedAt).toBe(sourceFetchedAt);
    expect(index.lastUpdated).toBe(runGeneratedAt);
    expect(yearSummary.generatedAt).toBe(runGeneratedAt);
  } finally {
    if (previousDocsDir === undefined) delete process.env.DOCS_DIR;
    else process.env.DOCS_DIR = previousDocsDir;
    rmSync(docsDir, { recursive: true, force: true });
  }
});
