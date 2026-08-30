import { calcRPM, formatTime } from "./timeUtils";
import type {
  CurrentHeatActivity,
  CurrentHeatActiveAttempt,
  CurrentHeatResult,
  CurrentHeatSailTeam,
  CurrentHeatSnapshot,
  SnapshotActivity,
  StatsData,
  TimeLog,
  TimeType,
} from "./types";

type ParsedTimestamp = { milliseconds: number; iso: string };
type SourceLog = TimeLog & { timestamp: ParsedTimestamp };

type Entity = { id: string; name: string; imageUrl?: string };

const EMPTY_ACTIVITY = (): CurrentHeatActivity => ({
  completed: [],
  active: [],
  attemptsStarted: 0,
  attemptsCompleted: 0,
});

const UNKNOWN_CURRENT_HEAT: NonNullable<CurrentHeatSnapshot["currentHeat"]> = {
  id: "",
  number: 0,
  year: 0,
  date: "",
  state: "unknown",
  activeActivity: null,
};

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTimestamp(value: unknown, date?: string): ParsedTimestamp | null {
  if (!nonEmptyString(value)) return null;
  const source = value.trim();
  let milliseconds: number;
  const timeOnly = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(source);
  if (timeOnly && date) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.slice(0, 10));
    if (!dateOnly) return null;
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const hours = Number(timeOnly[1]);
    const minutes = Number(timeOnly[2]);
    const seconds = Number(timeOnly[3]);
    const millis = Number((timeOnly[4] || "").padEnd(3, "0"));
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    milliseconds = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
    const calendar = new Date(milliseconds);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(source)) return null;
    milliseconds = Date.parse(source);
  }
  return Number.isFinite(milliseconds)
    ? { milliseconds, iso: new Date(milliseconds).toISOString() }
    : null;
}

function entityMaps(data: StatsData): { players: Map<string, Entity>; teams: Map<string, Entity> } {
  const players = new Map<string, Entity>();
  for (const player of Array.isArray(data.players) ? data.players : []) {
    if (!player || !nonEmptyString(player._id) || !nonEmptyString(player.name)) continue;
    if (!players.has(player._id)) players.set(player._id, { id: player._id, name: player.name, imageUrl: nonEmptyString(player.image_url) ? player.image_url : undefined });
  }
  const teams = new Map<string, Entity>();
  for (const team of Array.isArray(data.teams) ? data.teams : []) {
    if (!team || !nonEmptyString(team._id) || !nonEmptyString(team.name)) continue;
    if (!teams.has(team._id)) teams.set(team._id, { id: team._id, name: team.name, imageUrl: nonEmptyString(team.image_url) ? team.image_url : undefined });
  }
  return { players, teams };
}

function validHeat(data: StatsData): { id: string; number: number; date: string; year: number } | null {
  const candidates = (Array.isArray(data.heats) ? data.heats : [])
    .filter((heat) => heat && heat.is_current && nonEmptyString(heat._id) && Number.isInteger(heat.heat) && heat.heat >= 0 && nonEmptyString(heat.date))
    .map((heat) => {
      const parsed = parseTimestamp("00:00:00", heat.date);
      return parsed
        ? { id: heat._id, number: heat.heat, date: heat.date, year: new Date(parsed.milliseconds).getUTCFullYear() }
        : null;
    })
    .filter((heat): heat is { id: string; number: number; date: string; year: number } => heat !== null)
    .sort((a, b) => b.number - a.number || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

function activityType(data: StatsData, name: string): TimeType | null {
  return (Array.isArray(data.timeTypes) ? data.timeTypes : []).find((type) => type && type.time_eng === name && nonEmptyString(type._id)) ?? null;
}

function validLogs(data: StatsData, heatId: string, typeId: string, heatDate: string): SourceLog[] {
  return (Array.isArray(data.timeLogs) ? data.timeLogs : [])
    .filter((log) => log && log.heat_id === heatId && log.time_type_id === typeId && nonEmptyString(log._id) && nonEmptyString(log.player_id) && finiteNonNegative(log.time_seconds))
    .map((log) => {
      const timestamp = parseTimestamp(log.time, heatDate);
      return timestamp && finiteNonNegative(log._creationTime) ? { ...log, timestamp } : null;
    })
    .filter((log): log is SourceLog => log !== null)
    .sort((a, b) => a.timestamp.milliseconds - b.timestamp.milliseconds || a._creationTime - b._creationTime || a._id.localeCompare(b._id));
}

function elapsedAtSnapshot(start: ParsedTimestamp, snapshot: ParsedTimestamp | null): number | null {
  if (!snapshot) return null;
  const elapsed = snapshot.milliseconds - start.milliseconds;
  return finiteNonNegative(elapsed) ? elapsed : null;
}

function groupsBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = key(item);
    const values = groups.get(group);
    if (values) values.push(item);
    else groups.set(group, [item]);
  }
  return groups;
}

function projectActivity(logs: SourceLog[], players: Map<string, Entity>, teams: Map<string, Entity>, snapshotTime: ParsedTimestamp | null, spin: boolean): CurrentHeatActivity {
  const activity = EMPTY_ACTIVITY();
  const completed: Array<CurrentHeatResult & { sortTime: number }> = [];
  const active: Array<CurrentHeatActiveAttempt & { sortTime: number }> = [];
  const logsWithKnownPlayers = logs.filter((log) => players.has(log.player_id));

  for (const pairLogs of groupsBy(logsWithKnownPlayers, (log) => `${log.player_id}\u0000${log.heat_id}\u0000${log.time_type_id}`).values()) {
    activity.attemptsStarted += Math.ceil(pairLogs.length / 2);
    for (let index = 0; index + 1 < pairLogs.length; index += 2) {
      const start = pairLogs[index];
      const end = pairLogs[index + 1];
      const durationMs = end.timestamp.milliseconds - start.timestamp.milliseconds;
      if (!finiteNonNegative(durationMs) || durationMs <= 0) continue;
      const player = players.get(start.player_id);
      const team = nonEmptyString(start.team_id) ? teams.get(start.team_id) : undefined;
      if (!player || !team) continue;
      const formattedTime = formatTime(durationMs);
      const rpm = spin ? calcRPM(durationMs) : undefined;
      if (spin && (rpm === undefined || !Number.isFinite(rpm) || rpm <= 0)) {
        continue;
      }
      completed.push({
        id: end._id,
        rank: 0,
        playerName: player.name,
        teamName: team.name,
        durationMs,
        formattedTime,
        displayLabel: formattedTime,
        ...(rpm === undefined ? {} : { rpm, displayRpmLabel: `${Math.round(rpm)} RPM` }),
        ...(player.imageUrl || team.imageUrl ? { imageUrl: player.imageUrl || team.imageUrl } : {}),
        sortTime: end.timestamp.milliseconds,
      });
    }
    const unmatched = pairLogs.length % 2 === 1 ? pairLogs[pairLogs.length - 1] : null;
    if (unmatched) {
      const player = players.get(unmatched.player_id);
      if (!player) continue;
      const elapsedMsAtSnapshot = elapsedAtSnapshot(unmatched.timestamp, snapshotTime);
      if (elapsedMsAtSnapshot === null) continue;
      const team = nonEmptyString(unmatched.team_id) ? teams.get(unmatched.team_id) : undefined;
      active.push({
        playerId: unmatched.player_id,
        playerName: player.name,
        ...(team ? { teamName: team.name } : {}),
        startedAt: unmatched.timestamp.iso,
        elapsedMsAtSnapshot,
        sortTime: unmatched.timestamp.milliseconds,
      });
    }
  }

  completed.sort((a, b) => spin ? ((b.rpm ?? 0) - (a.rpm ?? 0) || a.sortTime - b.sortTime || a.id.localeCompare(b.id)) : (a.durationMs - b.durationMs || a.sortTime - b.sortTime || a.id.localeCompare(b.id)));
  const bestDuration = completed[0]?.durationMs ?? 0;
  const bestRpm = completed[0]?.rpm ?? 0;
  activity.completed = completed.map((result, index) => {
    const { sortTime: _sortTime, ...entry } = result;
    entry.rank = index + 1;
    entry.displayLabel = spin
      ? `${index === 0 ? "" : "-"}${Math.round(index === 0 ? entry.rpm ?? 0 : bestRpm - (entry.rpm ?? 0))} RPM`
      : index === 0 ? entry.formattedTime : `+${((entry.durationMs - bestDuration) / 1000).toFixed(3)}s`;
    return entry;
  });
  active.sort((a, b) => a.sortTime - b.sortTime || a.playerId.localeCompare(b.playerId));
  activity.active = active.map(({ sortTime: _sortTime, ...entry }) => entry);
  activity.attemptsCompleted = activity.completed.length;
  return activity;
}

function projectSail(logs: SourceLog[], players: Map<string, Entity>, teams: Map<string, Entity>, snapshotTime: ParsedTimestamp | null): CurrentHeatSailTeam[] {
  const byTeam = groupsBy(logs.filter((log) => nonEmptyString(log.team_id) && teams.has(log.team_id)), (log) => log.team_id!);
  const projected: Array<CurrentHeatSailTeam & { finishMs: number | null; finishAt?: string }> = [];
  for (const [teamId, teamLogs] of [...byTeam.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const team = teams.get(teamId);
    if (!team || !snapshotTime) continue;
    const ordered = teamLogs.filter((log) => players.has(log.player_id));
    if (!ordered.length) continue;
    const elapsedMsAtSnapshot = elapsedAtSnapshot(ordered[0].timestamp, snapshotTime);
    if (elapsedMsAtSnapshot === null) continue;
    const currentPlayer = players.get(ordered[ordered.length - 1].player_id);
    const sixteenth = ordered[15];
    projected.push({
      teamId,
      teamName: team.name,
      ...(team.imageUrl ? { imageUrl: team.imageUrl } : {}),
      sailLogCount: ordered.length,
      handoffCount: Math.floor(Math.max(0, ordered.length - 1) / 2),
      completedLegCount: Math.floor(Math.max(0, ordered.length - 1) / 2),
      status: "racing",
      ...(currentPlayer ? { currentPlayerName: currentPlayer.name } : {}),
      startedAt: ordered[0].timestamp.iso,
      elapsedMsAtSnapshot,
      finishMs: sixteenth?.timestamp.milliseconds ?? null,
      finishAt: sixteenth?.timestamp.iso,
    });
  }
  const winner = projected.filter((team) => team.finishMs !== null).sort((a, b) => a.finishMs! - b.finishMs! || a.teamId.localeCompare(b.teamId))[0];
  return projected.map(({ finishMs, finishAt, ...team }) => winner && team.teamId === winner.teamId ? { ...team, status: "finished", finishedAt: finishAt } : team);
}

function activeActivity(beer: CurrentHeatActivity, spin: CurrentHeatActivity, sail: CurrentHeatSailTeam[]): SnapshotActivity | null {
  const active: SnapshotActivity[] = [];
  if (beer.active.length) active.push("beer");
  if (spin.active.length) active.push("spin");
  if (sail.some((team) => team.status === "racing")) active.push("sail");
  return active.length === 1 ? active[0] : null;
}

export function createCurrentHeatSnapshot(data: StatsData, generatedAt: string, sourceFetchedAt = generatedAt): CurrentHeatSnapshot {
  const heat = validHeat(data);
  const empty = (): CurrentHeatSnapshot["activities"] => ({ beer: EMPTY_ACTIVITY(), spin: EMPTY_ACTIVITY(), sail: { teams: [] } });
  if (!heat) return { schemaVersion: 1, generatedAt, sourceFetchedAt, currentHeat: { ...UNKNOWN_CURRENT_HEAT }, activities: empty() };

  const snapshotTime = parseTimestamp(generatedAt);
  const { players, teams } = entityMaps(data);
  const beerType = activityType(data, "Beer");
  const spinType = activityType(data, "Spin");
  const sailType = activityType(data, "Sail");
  const beer = beerType ? projectActivity(validLogs(data, heat.id, beerType._id, heat.date), players, teams, snapshotTime, false) : EMPTY_ACTIVITY();
  const spin = spinType ? projectActivity(validLogs(data, heat.id, spinType._id, heat.date), players, teams, snapshotTime, true) : EMPTY_ACTIVITY();
  const sail = sailType ? projectSail(validLogs(data, heat.id, sailType._id, heat.date), players, teams, snapshotTime) : [];
  return {
    schemaVersion: 1,
    generatedAt,
    sourceFetchedAt,
    currentHeat: { id: heat.id, number: heat.number, year: heat.year, date: heat.date, state: "running", activeActivity: activeActivity(beer, spin, sail) },
    activities: { beer, spin, sail: { teams: sail } },
  };
}
