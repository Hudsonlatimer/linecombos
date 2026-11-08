# LineCombos

Hockey lineups from the first rumour to the final ice time. Every lineup is labelled with its stage (**Projected → Reported → Confirmed → Actual / Live**), a source and a timestamp.

- **NHL lines, PP/PK units and pairs** built from the NHL's real shift data, not guesses
- **Goalie starts**: last starter, projected starter, back-to-backs, reported starters
- **News feed** from beat reporters (Bluesky now, plus your X scraper), auto-tagged by team and type
- **Live gamecenters**: live lines with on-ice shots, shot map, period shot bars, box score
- **Stats, EDGE leaders, standings, schedule, prospects and Central Scouting rankings**
- **Every NHL player in history**: about 9,500 player pages, covering all 8,834 players who have played an NHL game since 1917, plus today's prospects and the World Juniors pool. Search them from any page (Ctrl/⌘ K or /). Current players' pages have:
  - headshot and action photo
  - bio, draft details, and the team he played for before the NHL
  - a filterable career timeline: junior and pro stops, international events, the draft, NHL debut, awards, signings, trades, waivers, call-ups and injuries
  - career stats in every league, with an NHL career-arc chart
  - contract history, plus a link to CapWages for cap hits
- **Injuries and scratches**: the league-wide injury report plus who sat out each team's last game
- **Moves**: every trade, signing, waiver claim and call-up, filterable by type and team
- **Stanley Cup predictor**: 10,000 simulated seasons and playoffs give playoff, round-by-round and Cup odds for all 32 teams. A bracket builder lets you pick, auto-fill or simulate the playoffs and share the result.
- **World Juniors 2027**: a projected lineup for every team, the full eligible pool, and a build-your-own lineup tool you can share as a link or image

No framework and no dependencies. A Node script builds a static site into `dist/`.

## Run it

```bash
npm run build
```

```bash
npm run dev
```

Open http://localhost:5180. The first build takes about 5 minutes because it fetches every roster, prospect list and all ~9,600 player pages; later builds use `.cache/` and take about 30 seconds. Retired players' data is cached for 30 days. Use `npm run build:fresh` to ignore the cache, or set `NO_HISTORY=1` to skip the all-time players for a quick local build.

```bash
npm test
```

## Free hosting

| Piece | Service | Cost |
|---|---|---|
| Static site | Cloudflare Pages | Free, unlimited bandwidth |
| Live gamecenter API | Cloudflare Worker (`worker/`) | Free, 100k requests/day |
| Rebuilds every 30 min | GitHub Actions cron | Free on public repos |
| Domain | nhllinecombos.com (or a non-NHL brand) | About $10/yr |

Setup:

1. Push this folder to a GitHub repo.
2. In Cloudflare, create a Pages project called `linecombos` (direct upload).
3. Deploy the worker:
   ```bash
   cd worker && npx wrangler deploy
   ```
4. In the GitHub repo settings, add these secrets:
   - `CLOUDFLARE_API_TOKEN` (needs Pages edit permission)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `LIVE_API`: the worker URL, for example https://linecombos-live.you.workers.dev
   - `X_FEED_URL`: optional, see below
5. Run the "Build and deploy" workflow once by hand, then add your domain in Pages.

Vercel works too: set the build command to `npm run build` and the output folder to `dist`. You still need the cron (GitHub Actions calling a Vercel deploy hook) and the worker, which also runs as a Vercel function. Cloudflare is the better fit because its bandwidth is unlimited.

Without `LIVE_API`, gamecenters still work. They refresh from the snapshots written on each build, which means they lag by up to 30 minutes.

## News sources

- **Bluesky**: edit the handle list in `config/sources.json`. It uses the free public API and needs no login.
- **X**: your scraper either
  - drops JSON files into `data/x-inbox/`, as `[{ "id", "author", "handle", "text", "createdAt", "url" }]`, or
  - serves that JSON at a URL you put in the `X_FEED_URL` secret.

Posts are kept in `data/posts.json` for 14 days. Each post is parsed by rules: surnames joined by dashes are matched against real rosters to find lines, and keywords mark goalie, injury and roster news. Reported lineups appear on team pages with the reporter's name and the time.

## World Juniors

- `config/wjc.json`: teams, groups, schedule, and league strength factors.
- `config/wjc/overrides.json`: add players the pool misses (often undrafted Europeans), or remove players.
- `config/wjc/rosters/CODE.json`: when a federation names its camp or final roster, drop it here. The team's stage moves to Reported or Confirmed, and the projection only uses rostered players.
- `config/wjc/lines/CODE.json`: lines reported from practice or games. These replace the projection.

- `config/wjc/sources/`: the federation evidence the projection starts from. Refresh these each year:
  - `2026-summer-camps.json`: summer showcase invites (Canada, USA, Finland, part of Sweden)
  - `2026-wjc-rosters.json`: last year's tournament rosters
  - `2026-birthdates.json`: birthdates for those players (Hockey Canada rosters, THN), used to drop anyone who has aged out
  - `extra.json`: anything else, such as Norway's promoted team

How the projection works:
- **Pool.** Showcase invites, last year's players who are still young enough, NHL prospects, recent draft picks and Central Scouting's ranked players. Players whose birthdate can't be confirmed are kept only to fill empty spots, and are marked with a "?".
- **Country.** The national team a player has actually played for (U17, U18 or U20), then the source lists, then birth country.
- **Score.** League-adjusted points per game, shrunk toward average on small samples, plus bonuses for draft position, a camp invite, World Juniors experience and age. Canada and the US invite nearly every real candidate to their showcase, so uninvited players there are marked down.
- **Lineup.** Players already in the NHL are left out unless a roster names them. Centres and wings fill their own slots, and defence pairs balance left and right shots. The reasoning for each player is shown on the page.

## Layout

```
config/        site, sources, team tags, WJC config
src/core/      pure logic shared with the worker (lines from shifts, post parser, game JSON)
src/lib/       data fetching (NHL API, posts, WJC pool)
src/render/    HTML for every page
public/assets/ CSS and JS (theme, search, tables, gamecenter, WJC builder)
worker/        Cloudflare Worker for live gamecenters
```

Data comes from the NHL's public (unofficial) APIs. Injuries and transactions (back to 2014) come from ESPN's public site API. Transactions are matched to players by name and position, with tolerance for one-letter typos. Contract dollars (cap hit, term, salary by season, clauses) and team cap space come from CapWages team pages, one request per team per day, matched to NHL ids by name and birthdate. Only current and signed-future deals carry figures, so older signings show term and type only. Franchise and all-time records come from the NHL stats API. The prospects page lists every first-time-eligible player for the next draft from the OHL, WHL, QMJHL and USHL public stat feeds (HockeyTech), with Central Scouting grades from `config/draft/<year>-central-scouting.json`. Players without a static page open in `/player/?id=…`, which shows full career stats through the worker's `/player/:id` route when `LIVE_API` is set. LineCombos is not affiliated with the NHL, and team names and logos belong to their owners.
