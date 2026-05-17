export interface Player {
  _id: string;
  name: string;
  image_url?: string;
  fun_fact?: string;
  _creationTime: number;
}

export interface Team {
  _id: string;
  name: string;
  player_1_id?: string;
  player_2_id?: string;
  player_3_id?: string;
  player_4_id?: string;
  image_url?: string;
  is_out?: boolean;
  _creationTime: number;
}

export interface Heat {
  _id: string;
  name?: string;
  heat: number;
  date: string;
  is_current: boolean;
  _creationTime: number;
}

export interface TimeType {
  _id: string;
  name: string;
  time_eng: string;
  description?: string;
  _creationTime: number;
}

export interface TimeLog {
  _id: string;
  player_id: string;
  team_id?: string;
  heat_id: string;
  time_type_id: string;
  time_seconds: number;
  time?: string;
  _creationTime: number;
}

export interface StatsData {
  players: Player[];
  teams: Team[];
  heats: Heat[];
  timeTypes: TimeType[];
  timeLogs: TimeLog[];
}

export interface TimeEntry {
  playerId: string;
  teamId?: string;
  heatId: string;
  formattedTime?: string;
  duration?: number;
}

export interface RankingEntry {
  rank: number;
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName: string;
  teamImageUrl?: string;
  heatNumber: number;
  heatId: string;
  duration: number;
  formattedTime: string;
  displayLabel: string;
  imageUrl?: string;
  rpm?: number;
  displayRpmLabel?: string;
}

export interface TeamProfile {
  teamId: string;
  teamName: string;
  imageUrl?: string;
  isOut: boolean;
  players: Array<{
    playerId: string;
    playerName: string;
    imageUrl?: string;
    funFact?: string;
  }>;
  bestTimes: Record<string, number>;
  radarData: Array<{
    subject: string;
    performance: number;
    fullMark: number;
  }>;
}

export interface PlayerProfile {
  playerId: string;
  playerName: string;
  imageUrl?: string;
  funFact?: string;
  teamId?: string;
  teamName?: string;
  personalBests: Record<string, { duration: number; heat: number; year: number }>;
  participation: {
    totalHeats: number;
    years: number[];
  };
}

export type TimeTypeKey = "Beer" | "Sail" | "Spin";

export const PERFORMANCE_SCALES = {
  BEER: { min: 3, max: 20 },
  SPIN: { min: 5, max: 20 },
  SAIL: { min: 8, max: 30 },
} as const;

export const REVOLUTIONS = 10;
