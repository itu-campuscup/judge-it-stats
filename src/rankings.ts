import { calcTimeDifference, formatTime, calcRPM, milliToSecs } from "./timeUtils";
import type { TimeLog, Heat, Player, Team, TimeType, TimeEntry, RankingEntry, TimeTypeKey, TeamProfile, PlayerProfile, PERFORMANCE_SCALES } from "./types";

const PERFORMANCE_SCALES_CONST = {
  BEER: { min: 3, max: 20 },
  SPIN: { min: 5, max: 20 },
  SAIL: { min: 8, max: 30 },
} as const;

export function filterAndSortTimeLogs(
  timeLogs: TimeLog[],
  heats: Heat[],
  year: number,
  timeTypeId: string,
): TimeLog[] {
  const heatIdsInYear = new Set(
    heats
      .filter((heat) => new Date(heat.date).getFullYear() === year)
      .map((heat) => heat._id),
  );

  return timeLogs
    .filter(
      (tl) => tl.time_type_id === timeTypeId && heatIdsInYear.has(tl.heat_id),
    )
    .sort((a, b) => {
      const aTime = a.time || "";
      const bTime = b.time || "";
      if (aTime < bTime) return -1;
      if (aTime > bTime) return 1;
      return 0;
    });
}

export function calculateTimes(logsSortedByTime: TimeLog[]): TimeEntry[] {
  const times: TimeEntry[] = [];
  const pendingStarts = new Map<string, { startTime: string; teamId?: string }>();

  for (const log of logsSortedByTime) {
    const key = `${log.player_id}-${log.heat_id}`;
    const startTimeData = pendingStarts.get(key);

    if (startTimeData) {
      const duration = calcTimeDifference(startTimeData.startTime, log.time || "");
      const formattedTime = formatTime(duration);
      times.push({
        playerId: log.player_id,
        heatId: log.heat_id,
        teamId: startTimeData.teamId,
        formattedTime,
        duration,
      });
      pendingStarts.delete(key);
    } else {
      pendingStarts.set(key, {
        startTime: log.time || "",
        teamId: log.team_id,
      });
    }
  }

  return times.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
}

export function removeDuplicateTimeEntries(entries: TimeEntry[], limit?: number): TimeEntry[] {
  const playerIds = new Set<string>();
  const filtered: TimeEntry[] = [];
  for (const entry of entries) {
    if (playerIds.has(entry.playerId)) continue;
    playerIds.add(entry.playerId);
    filtered.push(entry);
    if (limit !== undefined && filtered.length >= limit) break;
  }
  return filtered;
}

export function removeDuplicateTimeEntriesAll(entries: TimeEntry[]): TimeEntry[] {
  return removeDuplicateTimeEntries(entries);
}

export function getPlayerName(playerId: string, players: Player[]): string {
  const player = players.find((p) => p._id === playerId);
  return player ? player.name : "";
}

export function getTeamName(teamId: string | undefined, teams: Team[]): string {
  if (!teamId) return "";
  const team = teams.find((t) => t._id === teamId);
  return team ? team.name : "";
}

export function getHeatNumber(heatId: string, heats: Heat[]): number {
  const heat = heats.find((h) => h._id === heatId);
  return heat ? heat.heat : 0;
}

export function getHeatYear(heatId: string, heats: Heat[]): number {
  const heat = heats.find((h) => h._id === heatId);
  return heat ? new Date(heat.date).getFullYear() : 0;
}

export function getPlayerTeam(playerId: string, teams: Team[]): Team | undefined {
  return teams.find(
    (t) =>
      t.player_1_id === playerId ||
      t.player_2_id === playerId ||
      t.player_3_id === playerId ||
      t.player_4_id === playerId,
  );
}

export function getPlayerImageUrl(
  playerId: string,
  players: Player[],
  teams: Team[],
): string {
  const player = players.find((p) => p._id === playerId);
  if (player?.image_url) return player.image_url;
  const team = getPlayerTeam(playerId, teams);
  return team?.image_url || "";
}

export function generateRankings(
  topTimes: TimeEntry[],
  players: Player[],
  teams: Team[],
  heats: Heat[],
  timeType: TimeType,
): RankingEntry[] {
  const bestTime = topTimes.length > 0 ? topTimes[0].duration ?? 0 : 0;
  const isSpin = timeType.time_eng === "Spin";
  const bestRpm = isSpin && topTimes.length > 0 ? calcRPM(topTimes[0].duration ?? 0) : 0;

  let entries = topTimes.map((entry, index) => {
    const actualTime = entry.duration ?? 0;
    let displayLabel: string;

    if (isSpin) {
      const rpm = calcRPM(actualTime);
      if (index === 0) {
        displayLabel = `${Math.round(rpm)} RPM`;
      } else {
        displayLabel = `-${Math.round(bestRpm - rpm)} RPM`;
      }
      return {
        rank: index + 1,
        playerId: entry.playerId,
        playerName: getPlayerName(entry.playerId, players),
        teamId: entry.teamId,
        teamName: getTeamName(entry.teamId, teams),
        teamImageUrl: entry.teamId ? teams.find((t) => t._id === entry.teamId)?.image_url : undefined,
        heatNumber: getHeatNumber(entry.heatId, heats),
        heatId: entry.heatId,
        duration: actualTime,
        formattedTime: formatTime(actualTime),
        displayLabel,
        imageUrl: getPlayerImageUrl(entry.playerId, players, teams),
        rpm: calcRPM(actualTime),
        displayRpmLabel: displayLabel,
      };
    }

    if (index === 0) {
      displayLabel = formatTime(actualTime);
    } else {
      const diff = actualTime - bestTime;
      displayLabel = `+${milliToSecs(diff, 3)}s`;
    }

    return {
      rank: index + 1,
      playerId: entry.playerId,
      playerName: getPlayerName(entry.playerId, players),
      teamId: entry.teamId,
      teamName: getTeamName(entry.teamId, teams),
      teamImageUrl: entry.teamId ? teams.find((t) => t._id === entry.teamId)?.image_url : undefined,
      heatNumber: getHeatNumber(entry.heatId, heats),
      heatId: entry.heatId,
      duration: actualTime,
      formattedTime: formatTime(actualTime),
      displayLabel,
      imageUrl: getPlayerImageUrl(entry.playerId, players, teams),
    };
  });

  if (isSpin) {
    entries = [...entries].sort((a, b) => (b.rpm ?? 0) - (a.rpm ?? 0));
    entries = entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  return entries;
}

export function getBestIntraHeatTime(
  timeLogs: TimeLog[],
  heats: Heat[],
): TimeEntry | null {
  const splitLogs = splitTimeLogsPerHeat(timeLogs);
  let bestTime: TimeEntry | null = null;

  for (const heatTimes of splitLogs) {
    const times = calculateTimes(heatTimes);
    const topTime = removeDuplicateTimeEntries(times, 1)[0];

    if (
      topTime &&
      topTime.duration &&
      (!bestTime || topTime.duration < (bestTime.duration ?? Infinity))
    ) {
      bestTime = topTime;
    }
  }

  return bestTime;
}

function splitTimeLogsPerHeat(timeLogs: TimeLog[]): TimeLog[][] {
  const result: TimeLog[][] = [];
  const byHeat = new Map<string, TimeLog[]>();
  for (const log of timeLogs) {
    const existing = byHeat.get(log.heat_id);
    if (existing) {
      existing.push(log);
    } else {
      byHeat.set(log.heat_id, [log]);
    }
  }
  for (const logs of byHeat.values()) {
    result.push(logs);
  }
  return result;
}

function timeToPercentage(time: number, minTime: number, maxTime: number): number {
  if (time <= 0) return 0;
  if (time <= minTime) return 100;
  if (time >= maxTime) return 0;
  return Math.round(100 - ((time - minTime) / (maxTime - minTime)) * 100);
}

export function generateTeamRadarData(
  bestTimes: Record<string, number>,
): Array<{ subject: string; performance: number; fullMark: number }> {
  const timeTypes: TimeTypeKey[] = ["Beer", "Sail", "Spin"];
  return timeTypes.map((timeType) => {
    const time = bestTimes[timeType] || 0;
    const scaleKey = timeType.toUpperCase() as keyof typeof PERFORMANCE_SCALES_CONST;
    const { min: minTime, max: maxTime } = PERFORMANCE_SCALES_CONST[scaleKey];
    const timeInSeconds = time / 1000;
    const performance = timeToPercentage(timeInSeconds, minTime, maxTime);
    return { subject: timeType, performance, fullMark: 100 };
  });
}

export function generateTeamProfiles(
  data: { players: Player[]; teams: Team[]; heats: Heat[]; timeTypes: TimeType[]; timeLogs: TimeLog[] },
  year: number,
): TeamProfile[] {
  const { players, teams, heats, timeTypes, timeLogs } = data;
  const yearHeats = heats.filter((heat) => new Date(heat.date).getFullYear() === year);
  const yearHeatIds = new Set(yearHeats.map((heat) => heat._id));
  const yearTimeLogs = timeLogs.filter((log) => yearHeatIds.has(log.heat_id));
  const participatingTeamIds = new Set(
    yearTimeLogs
      .map((log) => log.team_id)
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
  const yearTeams = teams.filter((team) => participatingTeamIds.has(team._id));

  return yearTeams.map((team) => {
    const teamPlayerIds = [
      ...new Set(
        yearTimeLogs
          .filter((log) => log.team_id === team._id)
          .map((log) => log.player_id),
      ),
    ];

    const teamPlayers = teamPlayerIds.map((pId) => {
      const p = players.find((pl) => pl._id === pId);
      return {
        playerId: pId,
        playerName: p?.name || "",
        imageUrl: p?.image_url,
        funFact: p?.fun_fact,
      };
    });

    const bestTimes: Record<string, number> = {};
    for (const timeType of timeTypes) {
      const playerDurations: number[] = [];
      for (const pId of teamPlayerIds) {
        const playerLogs = yearTimeLogs.filter(
          (tl) =>
            tl.team_id === team._id &&
            tl.player_id === pId &&
            tl.time_type_id === timeType._id,
        );
        const best = getBestIntraHeatTime(playerLogs, yearHeats);
        if (best?.duration) {
          playerDurations.push(best.duration);
        }
      }
      if (playerDurations.length > 0) {
        const avg = playerDurations.reduce((a, b) => a + b, 0) / playerDurations.length;
        bestTimes[timeType.time_eng] = avg;
      }
    }

    return {
      teamId: team._id,
      teamName: team.name,
      imageUrl: team.image_url,
      isOut: team.is_out ?? false,
      players: teamPlayers,
      bestTimes,
      radarData: generateTeamRadarData(bestTimes),
    };
  });
}

export function generatePlayerProfiles(
  data: { players: Player[]; teams: Team[]; heats: Heat[]; timeTypes: TimeType[]; timeLogs: TimeLog[] },
): PlayerProfile[] {
  const { players, teams, heats, timeTypes, timeLogs } = data;

  return players.map((player) => {
    const team = getPlayerTeam(player._id, teams);
    const personalBests: PlayerProfile["personalBests"] = {};
    const participatedHeats = new Set<string>();
    const participatedYears = new Set<number>();

    for (const timeType of timeTypes) {
      const playerLogs = timeLogs.filter(
        (tl) => tl.player_id === player._id && tl.time_type_id === timeType._id,
      );
      const best = getBestIntraHeatTime(playerLogs, heats);
      if (best?.duration) {
        const heatYear = getHeatYear(best.heatId, heats);
        const heatNum = getHeatNumber(best.heatId, heats);
        personalBests[timeType.time_eng] = {
          duration: best.duration,
          heat: heatNum,
          year: heatYear,
        };
      }
      for (const log of playerLogs) {
        participatedHeats.add(log.heat_id);
        const yr = heats.find((h) => h._id === log.heat_id);
        if (yr) participatedYears.add(new Date(yr.date).getFullYear());
      }
    }

    return {
      playerId: player._id,
      playerName: player.name,
      imageUrl: player.image_url,
      funFact: player.fun_fact,
      teamId: team?._id,
      teamName: team?.name,
      personalBests,
      participation: {
        totalHeats: participatedHeats.size,
        years: [...participatedYears].sort((a, b) => b - a),
      },
    };
  });
}
