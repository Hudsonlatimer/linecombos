import SwiftUI

struct TodayView: View {
    @EnvironmentObject var store: Store

    private var grouped: [(day: String, games: [PGame])] {
        Dictionary(grouping: store.games, by: \.date).sorted { $0.key < $1.key }.map { (day: $0.key, games: $0.value) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let e = store.error { Text(e).foregroundStyle(.red) }
                ForEach(grouped, id: \.day) { group in
                    Section(dayTitle(group.day)) { ForEach(group.games) { GameRow(game: $0) } }
                }
            }
            .overlay { if store.games.isEmpty && store.error == nil { ProgressView() } }
            .navigationTitle("Predictions")
            .refreshable { await store.refresh() }
        }
    }

    private func dayTitle(_ iso: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return iso }
        if Calendar.current.isDateInToday(d) { return "Today" }
        let o = DateFormatter(); o.dateFormat = "EEEE, MMM d"
        return o.string(from: d)
    }
}

struct GameRow: View {
    let game: PGame

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                team(game.a.abbr, goalie: game.a.goalie, score: game.result?.ag)
                Spacer()
                VStack(spacing: 2) {
                    if game.isLive { Text("LIVE").font(.caption.bold()).foregroundStyle(.red) }
                    else if game.isFinal { Text("Final").font(.caption.bold()).foregroundStyle(.secondary) }
                    else if let d = game.startDate { Text(d, style: .time).font(.caption.bold()).foregroundStyle(.secondary) }
                }
                Spacer()
                team(game.h.abbr, goalie: game.h.goalie, score: game.result?.hg)
            }
            // Win probability bar: away on the left, home on the right
            GeometryReader { g in
                HStack(spacing: 2) {
                    Capsule().fill(Color.blue.opacity(0.35)).frame(width: g.size.width * (1 - game.home))
                    Capsule().fill(Color.blue).frame(width: g.size.width * game.home)
                }
            }.frame(height: 6)
            HStack {
                Text(percent(1 - game.home)).bold()
                Spacer()
                if let r = game.result {
                    let pickedRight = (game.home >= 0.5) == r.homeWon
                    Label(pickedRight ? "Picked right" : "Missed", systemImage: pickedRight ? "checkmark.circle.fill" : "xmark.circle")
                        .font(.caption).foregroundStyle(pickedRight ? Color.green : Color.secondary)
                } else {
                    Text("\(game.favourite.abbr) favoured").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(percent(game.home)).bold()
            }.font(.subheadline)
        }
        .padding(.vertical, 6)
    }

    private func team(_ abbr: String, goalie: GoalieInfo?, score: Int?) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                TeamBadge(abbr: abbr)
                if let score { Text("\(score)").font(.title2.bold()) }
            }
            if let n = goalie?.name {
                Text(n.split(separator: " ").last.map(String.init) ?? n)
                    .font(.caption2).foregroundStyle(goalie?.status == "confirmed" ? Color.green : Color.secondary)
            }
        }
    }
}
