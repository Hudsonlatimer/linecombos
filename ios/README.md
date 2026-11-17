# LineCombos for iPhone (prototype)

A native SwiftUI app that reads the same live data as the website. It has three tabs:

- **Predictions**: every game in the next few days with win chances, confirmed goalies and, for finished games, whether the model picked right.
- **Awards**: front-runners for every trophy (tap one for the full top six), plus the All-Star and All-Rookie teams.
- **Standings**: by division, conference or league.

It refreshes every minute while open, and you can pull down to refresh.

## Run it

You need a Mac with Xcode 15 or later (or Swift Playgrounds 4.4+ on an iPad).

1. Open `LineCombos.swiftpm` in Xcode (File > Open).
2. Pick an iPhone simulator, or your own iPhone, and press Run.
3. To run on your own phone, set your team under the app's Signing settings.

There is no project file to maintain: the folder is a Swift Playgrounds-style app package.

## Where the data comes from

- `https://linecombos.vercel.app/data/predictions.json` and `/data/awards.json`, rebuilt by the site every few minutes.
- `https://api-web.nhle.com/v1/standings/now`, directly from the NHL.

The site address is set once, in `Sources/Store.swift`.

## Not done yet

- I couldn't compile it where I wrote it (no Mac), so expect a typo or two on first run. The data models were checked against the live JSON.
- Team logos are coloured abbreviation badges, because the NHL's logos are SVG files and SwiftUI can't draw those directly.
- No team pages or lineups yet. The site builds those as web pages, so the next step is a `/data/teams.json` file for the app to read.
- No push notifications (goalie confirmed, goal scored). Those need an Apple developer account and a small server.

## No Mac? Use the web app

The website can be installed from Safari: open https://linecombos.vercel.app, tap Share, then "Add to Home Screen". It gets its own icon and opens full screen.
