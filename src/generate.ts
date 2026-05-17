import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { StatsData, RankingEntry, TeamProfile, PlayerProfile } from "./types";
import {
  filterAndSortTimeLogs,
  calculateTimes,
  removeDuplicateTimeEntries,
  removeDuplicateTimeEntriesAll,
  generateRankings,
  generateTeamProfiles,
  generatePlayerProfiles,
} from "./rankings";
import { getDocsDir } from "./config";

function writeJson(path: string, data: unknown): void {
  const dir = resolve(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function getCachedYears(docsDir: string): Set<number> {
  const rankingsDir = join(docsDir, "rankings");
  if (!existsSync(rankingsDir)) return new Set();
  const entries = readdirSync(rankingsDir, { withFileTypes: true });
  const years = new Set<number>();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const parsed = parseInt(entry.name, 10);
      if (!isNaN(parsed) && parsed > 2000 && parsed < 2100) {
        const summaryPath = join(rankingsDir, entry.name, "summary.json");
        if (existsSync(summaryPath)) {
          years.add(parsed);
        }
      }
    }
  }
  return years;
}

function getCurrentYear(heats: StatsData["heats"]): number {
  const currentHeat = heats.find((h) => h.is_current);
  if (currentHeat) return new Date(currentHeat.date).getFullYear();
  if (heats.length > 0) return new Date(heats[0].date).getFullYear();
  return new Date().getFullYear();
}

function getAvailableYears(heats: StatsData["heats"]): number[] {
  return [
    ...new Set(heats.map((h) => new Date(h.date).getFullYear())),
  ].sort((a, b) => b - a);
}

function generateRankingsForYear(
  data: StatsData,
  year: number,
): Record<string, RankingEntry[]> {
  const rankingsByType: Record<string, RankingEntry[]> = {};

  for (const timeType of data.timeTypes) {
    const logs = filterAndSortTimeLogs(data.timeLogs, data.heats, year, timeType._id);
    const times = calculateTimes(logs);
    const topTimes = removeDuplicateTimeEntriesAll(times);
    const rankings = generateRankings(topTimes, data.players, data.teams, data.heats, timeType);
    rankingsByType[timeType.time_eng] = rankings;
  }

  return rankingsByType;
}

function generateRankingsForHeat(
  data: StatsData,
  heatId: string,
  year: number,
): Record<string, RankingEntry[]> {
  const heat = data.heats.find((h) => h._id === heatId);
  if (!heat) return {};

  const rankingsByType: Record<string, RankingEntry[]> = {};
  const heatLogs = data.timeLogs.filter((tl) => tl.heat_id === heatId);

  for (const timeType of data.timeTypes) {
    const logs = heatLogs
      .filter((tl) => tl.time_type_id === timeType._id)
      .sort((a, b) => {
        const aTime = a.time || "";
        const bTime = b.time || "";
        if (aTime < bTime) return -1;
        if (aTime > bTime) return 1;
        return 0;
      });
    const times = calculateTimes(logs);
    const topTimes = removeDuplicateTimeEntriesAll(times);
    const rankings = generateRankings(topTimes, data.players, data.teams, data.heats, timeType);
    rankingsByType[timeType.time_eng] = rankings;
  }

  return rankingsByType;
}

function generateSummary(rankingsByType: Record<string, RankingEntry[]>) {
  const summary: Record<string, RankingEntry[]> = {};
  for (const [type, rankings] of Object.entries(rankingsByType)) {
    summary[type] = rankings.slice(0, 5);
  }
  return summary;
}

function writeYearRankings(
  docsDir: string,
  year: number,
  rankingsByType: Record<string, RankingEntry[]>,
): void {
  const yearDir = join(docsDir, "rankings", String(year));

  for (const [type, rankings] of Object.entries(rankingsByType)) {
    const fileName = type.toLowerCase() + ".json";
    writeJson(join(yearDir, fileName), {
      timeType: type,
      year,
      generatedAt: new Date().toISOString(),
      rankings,
    });
  }

  writeJson(join(yearDir, "summary.json"), {
    year,
    generatedAt: new Date().toISOString(),
    top5: generateSummary(rankingsByType),
  });
}

function writeHeatRankings(
  docsDir: string,
  year: number,
  heatNumber: number,
  rankingsByType: Record<string, RankingEntry[]>,
): void {
  const heatDir = join(docsDir, "rankings", String(year), `heat-${heatNumber}`);

  for (const [type, rankings] of Object.entries(rankingsByType)) {
    writeJson(join(heatDir, `${type.toLowerCase()}.json`), {
      timeType: type,
      year,
      heat: heatNumber,
      generatedAt: new Date().toISOString(),
      rankings,
    });
  }

  writeJson(join(heatDir, "summary.json"), {
    year,
    heat: heatNumber,
    generatedAt: new Date().toISOString(),
    top5: generateSummary(rankingsByType),
  });
}

function writeOverallRankings(
  docsDir: string,
  data: StatsData,
): void {
  const allRankings: Record<string, RankingEntry[]> = {};

  for (const timeType of data.timeTypes) {
    const logs = data.timeLogs
      .filter((tl) => tl.time_type_id === timeType._id)
      .sort((a, b) => {
        const aTime = a.time || "";
        const bTime = b.time || "";
        if (aTime < bTime) return -1;
        if (aTime > bTime) return 1;
        return 0;
      });
    const times = calculateTimes(logs);
    const topTimes = removeDuplicateTimeEntriesAll(times);
    const rankings = generateRankings(topTimes, data.players, data.teams, data.heats, timeType);
    allRankings[timeType.time_eng] = rankings.slice(0, 5);
  }

  writeJson(join(docsDir, "rankings", "overall.json"), {
    generatedAt: new Date().toISOString(),
    allTimeTop5: allRankings,
  });
}

function writeTeamProfiles(docsDir: string, data: StatsData): void {
  const profiles = generateTeamProfiles(data);
  const teamsDir = join(docsDir, "teams");

  for (const profile of profiles) {
    writeJson(join(teamsDir, `${profile.teamId}.json`), {
      ...profile,
      generatedAt: new Date().toISOString(),
    });
  }
}

function writePlayerProfiles(docsDir: string, data: StatsData): void {
  const profiles = generatePlayerProfiles(data);
  const playersDir = join(docsDir, "players");

  for (const profile of profiles) {
    writeJson(join(playersDir, `${profile.playerId}.json`), {
      ...profile,
      generatedAt: new Date().toISOString(),
    });
  }
}

function writeIndex(docsDir: string, data: StatsData): void {
  const currentHeat = data.heats.find((h) => h.is_current) || null;

  writeJson(join(docsDir, "index.json"), {
    lastUpdated: new Date().toISOString(),
    years: getAvailableYears(data.heats),
    timeTypes: data.timeTypes.map((tt) => tt.time_eng),
    currentHeat: currentHeat
      ? { id: currentHeat._id, heat: currentHeat.heat, date: currentHeat.date }
      : null,
    totalPlayers: data.players.length,
    totalTeams: data.teams.length,
    totalHeats: data.heats.length,
    totalTimeLogs: data.timeLogs.length,
  });
}

export async function generate(
  data: StatsData,
  options: { full: boolean },
): Promise<void> {
  const docsDir = getDocsDir();
  const currentYear = getCurrentYear(data.heats);
  const allYears = getAvailableYears(data.heats);
  const cachedYears = options.full ? new Set<number>() : getCachedYears(docsDir);

  const yearsToGenerate = options.full
    ? allYears
    : allYears.filter((y) => y === currentYear || !cachedYears.has(y));

  console.log(`Current year: ${currentYear}`);
  console.log(`Available years: ${allYears.join(", ")}`);
  console.log(`Cached years: ${[...cachedYears].join(", ") || "none"}`);
  console.log(`Years to generate: ${yearsToGenerate.join(", ") || "none"}`);

  if (yearsToGenerate.length === 0) {
    console.log("Nothing to generate — all years cached.");
  }

  for (const year of yearsToGenerate) {
    console.log(`\nGenerating rankings for ${year}...`);
    const rankingsByType = generateRankingsForYear(data, year);
    writeYearRankings(docsDir, year, rankingsByType);

    const yearHeats = data.heats.filter((h) => new Date(h.date).getFullYear() === year);
    for (const heat of yearHeats) {
      const heatRankings = generateRankingsForHeat(data, heat._id, year);
      writeHeatRankings(docsDir, year, heat.heat, heatRankings);
    }
  }

  if (options.full) {
    console.log("\nGenerating overall rankings...");
    writeOverallRankings(docsDir, data);

    console.log("Generating team profiles...");
    writeTeamProfiles(docsDir, data);

    console.log("Generating player profiles...");
    writePlayerProfiles(docsDir, data);
  } else {
    console.log("\nUpdating team/player profiles for current year data...");
    writeTeamProfiles(docsDir, data);
    writePlayerProfiles(docsDir, data);
    writeOverallRankings(docsDir, data);
  }

  writeIndex(docsDir, data);
  console.log("\nDone! Output written to docs/");
}
