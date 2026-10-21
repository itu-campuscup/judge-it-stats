# Judge-It Stats Generator

Generates static JSON statistics for the Judge-It Campus Cup application from Convex data, deployed to GitHub Pages.

[![Fafnir: secrets](./assets/fafnir-badge.svg)](https://github.com/lucasfth/fafnir)

## How It Works

Every 5 minutes (via GitHub Actions cron), this script:
1. Fetches current year data from Convex via the `/stats` endpoint
2. Computes rankings for Beer, Sail, and Spin events
3. Generates JSON files for rankings, team profiles, player profiles, and the current-heat projection
4. Commits and deploys to GitHub Pages

Ranking data for prior years is cached locally — only the current year and any uncached years are regenerated. Team indexes are refreshed for every available year on each run.

## Output Structure

```
docs/
  current-heat.json              ← public current-heat projection (schema version 1)
  index.json                     ← manifest: last updated, years, current heat
  rankings/
    overall.json                 ← all-time top 5 per type
    {year}/
      beer.json                  ← ranked list for year
      sail.json                  ← ranked list for year
      spin.json                  ← ranked list (sorted by RPM desc)
      summary.json               ← combined top 5 for year
      heat-{n}/
        beer.json                ← per-heat rankings
        sail.json
        spin.json
        summary.json
  teams/
    {year}/
      index.json               ← discoverable team comparison profiles for the year
      {teamId}.json             ← individual team radar data & best times for the year
  players/{playerId}.json        ← player personal bests & participation
```

Player profiles use the team from the player's latest dated participation, independently of their personal-best year. Players without dated team participation retain the roster fallback.

## Setup

Install [Bun](https://bun.com) and [Fafnir](./FAFNIR.md#new-laptop-the-short-path) once. Then:

```bash
git clone --recurse-submodules git@github.com:itu-campuscup/judge-it-stats.git
cd judge-it-stats
bun install
fafnir key create  # once per laptop; skip if you already have an identity
fafnir key public  # send this PUBLIC recipient to a maintainer
```

After the maintainer grants access, pull the updated policy and ciphertext:

```bash
git pull --rebase
fafnir trust       # review and approve the recipients
bun run fafnir:check
```

**The shared configuration is production-only:** use `bun run generate:prod` (or append `--full`) only when deliberately reading production data, after receiving access to `.env.prod.fafnir`. The generator writes local output; it does not publish or deploy it. Optional `generate:shared` requires a separately initialized `.env.local.fafnir`; no shared development scope is currently configured. Never share private decryption keys.

[Fafnir onboarding and maintainer setup](./FAFNIR.md) covers grants, backend API-key provisioning and recovery. The production policy and ciphertext are included; new contributors still need a recipient grant. Successful decryption does not prove the API key matches the live backend.

Fafnir is experimental and not independently audited. CampusCup has chosen to use it for production too; keep independent recovery copies and restrict production recipients. GitHub Actions continues using its existing repository secrets.

### Without shared access

Copy `.env.example` to ignored `.env.local`, set your own `CONVEX_URL` and matching `STATS_API_KEY`, then run `bun run generate` or `bun run generate:full`. A maintainer must configure the same key on the source Convex deployment; see [backend provisioning](./FAFNIR.md#backend-api-key). Do not commit plaintext or private keys.

For isolated local output, set `DOCS_DIR` to a temporary directory; omit it to write to `docs/`.

## GitHub Actions Setup

1. Enable GitHub Pages in repo settings → Pages → Source: "GitHub Actions"
2. In repo settings → Actions → Secrets and variables → Actions, add:
   - `CONVEX_URL`: the Convex deployment URL
   - `STATS_API_KEY`: same key configured in Convex

The workflow runs automatically every 5 minutes, or can be triggered manually with "full" option. The generated `current-heat.json` is public and contains no Show IT secret.

## Schema Submodule

The `schema/` directory is a git submodule pointing to the judge-it Convex schema. It contains:
- `statsApi.ts` — HTTP endpoint for fetching all stats data (requires `STATS_API_KEY`)
- `http.ts` — registers the `/stats` route

To update the schema:
```bash
git submodule update --remote --merge schema
```

## Adding the Stats API to judge-it (if not already added)

The stats API is already added to the schema submodule. If you need to add it to the main judge-it repo:

1. Copy `schema/statsApi.ts` to `convex/statsApi.ts` in judge-it
2. Update `convex/http.ts`:
   ```ts
   import { getStatsData } from "./statsApi";
   http.route({ path: "/stats", method: "GET", handler: getStatsData });
   ```
3. Set `STATS_API_KEY` environment variable in Convex

## For the Consuming Frontend

The frontend fetches JSON from:
```
https://<org>.github.io/judge-it-stats/rankings/{year}/{type}.json
```

Example:
- All-time beer rankings: `/rankings/overall.json`
- 2026 beer rankings: `/rankings/2026/beer.json`
- Team comparison index: `/teams/{year}/index.json`
- Team profile: `/teams/{year}/{teamId}.json`
- Current heat projection: `/current-heat.json`

See `docs/index.json` for available years and current heat info.
