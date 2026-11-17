import Foundation

// MARK: - Site data (https://linecombos.vercel.app/data/*.json), rebuilt by the site every few minutes

struct Predictions: Decodable {
    let builtAt: String
    let games: [String: PGame]
}

struct PGame: Decodable, Identifiable {
    let id: Int
    let date: String
    let start: String?
    let state: String
    let home: Double          // home win probability, 0...1
    let lh: Double            // expected goals, home
    let la: Double            // expected goals, away
    let h: Side
    let a: Side
    let result: GameResult?

    var isFinal: Bool { state == "OFF" || state == "FINAL" }
    var isLive: Bool { state == "LIVE" || state == "CRIT" }
    var startDate: Date? { start.flatMap { ISO8601DateFormatter().date(from: $0) } }
    var favourite: (abbr: String, p: Double) { home >= 0.5 ? (h.abbr, home) : (a.abbr, 1 - home) }
}

struct Side: Decodable {
    let abbr: String
    let goalie: GoalieInfo?
}

struct GoalieInfo: Decodable {
    let name: String?
    let status: String?       // confirmed / likely / projected
}

struct GameResult: Decodable {
    let homeWon: Bool
    let hg: Int
    let ag: Int
}

struct Awards: Decodable {
    let builtAt: String
    let gpTeam: Int
    let voted: [String: [Candidate]]
    let races: [String: [Candidate]]
    let teams: [String: [Slot]]
}

/// One name in an award race. Players have an id and position; coaches and teams don't.
struct Candidate: Decodable, Identifiable {
    let id: Int?
    let name: String?
    let team: String
    let pos: String?
    let share: Double?        // model share of the contenders, voted awards only
    let value: Double?        // stat races
    let pace: Double?
    let line: String?

    var uid: String { "\(team)-\(name ?? "team")-\(id ?? 0)" }
    var display: String { name ?? team }
    var headshotURL: URL? { id.map { URL(string: "https://assets.nhle.com/mugs/nhl/20262027/\(team)/\($0).png")! } }
}

/// An All-Star slot is encoded as ["C", { ...player }].
struct Slot: Decodable, Identifiable {
    let slot: String
    let player: Candidate
    var id: String { slot + player.uid }
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        slot = try c.decode(String.self)
        player = try c.decode(Candidate.self)
    }
}

// MARK: - NHL standings (https://api-web.nhle.com/v1/standings/now)

struct StandingsResponse: Decodable { let standings: [TeamRow] }

struct TeamRow: Decodable, Identifiable {
    struct Name: Decodable { let `default`: String }
    let teamAbbrev: Name
    let teamName: Name
    let divisionName: String
    let conferenceName: String
    let gamesPlayed: Int
    let wins: Int
    let losses: Int
    let otLosses: Int
    let points: Int
    let pointPctg: Double
    var id: String { teamAbbrev.default }
    var abbr: String { teamAbbrev.default }
}

/// Award names, in the order the site shows them.
enum AwardInfo {
    static let voted: [(key: String, title: String, subtitle: String)] = [
        ("hart", "Hart Trophy", "Most valuable player"),
        ("vezina", "Vezina Trophy", "Best goaltender"),
        ("norris", "Norris Trophy", "Best defenceman"),
        ("calder", "Calder Trophy", "Rookie of the year"),
        ("selke", "Selke Trophy", "Best defensive forward"),
        ("lindsay", "Ted Lindsay Award", "Players' choice MVP"),
        ("byng", "Lady Byng Trophy", "Sportsmanship and ability"),
        ("adams", "Jack Adams Award", "Coach of the year"),
    ]
    static let races: [(key: String, title: String, unit: String)] = [
        ("artRoss", "Art Ross Trophy · points", "P"),
        ("richard", "Maurice Richard Trophy · goals", "G"),
        ("presidents", "Presidents' Trophy · points", "PTS"),
        ("jennings", "Fewest goals against per game", "GA/GP"),
    ]
}
