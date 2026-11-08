# Official World Juniors rosters

When a country announces its selection camp or final roster, add `<CODE>.json` here:

```json
{
  "status": "camp",
  "source": "Hockey Canada",
  "url": "https://...",
  "updated": "2026-12-01",
  "players": [
    { "first": "Gavin", "last": "McKenna", "pos": "L", "shoots": "L", "club": "Penn State (Big Ten)" }
  ]
}
```

`status` is `camp` (selection camp invites) or `final` (tournament roster). Players are matched to the
eligible pool by name (or `id` = NHL player id). The site then projects lines from this roster only.
