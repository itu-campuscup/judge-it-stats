# Judge-It Stats Generator

Generates static JSON statistics for the Judge-It Campus Cup application from Convex data, deployed to GitHub Pages.

## How It Works

Every 5 minutes (via GitHub Actions cron), this script:
1. Fetches current year data from Convex via the `/stats` endpoint
2. Computes rankings for Beer, Sail, and Spin events
3. Generates JSON files for rankings, team profiles, player profiles, and the current-heat projection
4. Commits and deploys to GitHub Pages

Prior years are cached locally — only the current year and any uncached years are regenerated.

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
    index.json                   ← discoverable team comparison profiles
    {teamId}.json                ← individual team radar data & best times
  players/{playerId}.json        ← player personal bests & participation
```

## Setup

### 1. Clone and install

```bash
git clone git@github.com:itu-campuscup/judge-it-stats.git
cd judge-it-stats
bun install
```

### 2. Configure Convex environment

Set the `STATS_API_KEY` in the judge-it Convex deployment:
```bash
cd ../judge-it
bun secrets:set STATS_API_KEY="your-secret-key"
bun push
```

### 3. Configure stats generator

Create `.env.local`:
```
CONVEX_URL=https://your-deployment-name.convex.cloud
STATS_API_KEY=your-secret-key
```

### 4. Run locally

```bash
bun run generate        # incremental (current year + uncached)
bun run generate:full   # regenerate all years
```

For local isolation, `DOCS_DIR` is an optional output-directory override; omit it to write to `docs/`.

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
- Team comparison index: `/teams/index.json`
- Team profile: `/teams/{teamId}.json`
- Current heat projection: `/current-heat.json`

See `docs/index.json` for available years and current heat info.
