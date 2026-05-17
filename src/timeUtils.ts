import { REVOLUTIONS } from "./types";

export function timeToMilli(time: string): number {
  const [hours, minutes, seconds] = time.split(":");
  const [secs, millis] = seconds.split(".");
  const millisValue = parseInt(millis ? millis.substring(0, 3) : "0");
  return (
    parseInt(hours) * 60 * 60 * 1000 +
    parseInt(minutes) * 60 * 1000 +
    parseInt(secs) * 1000 +
    millisValue
  );
}

export function milliToSecs(time: number, fixed: number | undefined): number | string {
  const actualTime = time / 1000;
  if (fixed === -1 || fixed === undefined) {
    return actualTime;
  }
  return fixed < 0 ? Math.floor(actualTime) : actualTime.toFixed(fixed);
}

export function calcRPM(timeMs: number): number {
  const secs = milliToSecs(timeMs, -1) as number;
  return (REVOLUTIONS / secs) * 60;
}

export function formatTime(timeMs: number): string {
  const ct = timeMs / 1000;
  const minutes = Math.floor(ct / 60);
  const seconds = Math.floor(ct % 60);
  const milliseconds = Math.floor((ct % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(milliseconds).padStart(3, "0")}`;
}

export function calcTimeDifference(startTime: string, endTime: string): number {
  const start = timeToMilli(startTime);
  const end = timeToMilli(endTime);
  return end - start;
}
