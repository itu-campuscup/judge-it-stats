import { getConfig, isFullRun } from "./src/config";
import { fetchAllData } from "./src/fetch";
import { generate } from "./src/generate";

async function main() {
  const full = isFullRun();
  console.log(`judge-it-stats generator`);
  console.log(`Mode: ${full ? "full" : "incremental (current year + uncached)"}`);

  const { convexUrl } = getConfig();
  console.log(`Fetching data from Convex...`);

  const data = await fetchAllData(convexUrl);

  console.log(
    `Fetched: ${data.players.length} players, ${data.teams.length} teams, ${data.heats.length} heats, ${data.timeTypes.length} time types, ${data.timeLogs.length} time logs`,
  );

  await generate(data, { full });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
