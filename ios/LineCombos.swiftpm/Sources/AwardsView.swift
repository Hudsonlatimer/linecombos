import SwiftUI

struct AwardsView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        NavigationStack {
            List {
                if let a = store.awards {
                    Section {
                        Text("Voted awards are the site's model estimates, not the real vote or betting odds. Stat races are exact.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Voted awards") {
                        ForEach(AwardInfo.voted, id: \.key) { info in
                            if let list = a.voted[info.key], !list.isEmpty {
                                NavigationLink {
                                    RaceDetail(title: info.title, list: list, shares: true)
                                } label: {
                                    LeaderRow(title: info.title, leader: list[0], showShare: true)
                                }
                            }
                        }
                    }
                    Section("Stat races") {
                        ForEach(AwardInfo.races, id: \.key) { info in
                            if let list = a.races[info.key], !list.isEmpty {
                                NavigationLink {
                                    RaceDetail(title: info.title, list: list, shares: false)
                                } label: {
                                    LeaderRow(title: info.title, leader: list[0], showShare: false)
                                }
                            }
                        }
                    }
                    Section("If the season ended today") {
                        NavigationLink("First All-Star Team") { SlotList(title: "First All-Star Team", slots: a.teams["allStar"] ?? []) }
                        NavigationLink("All-Rookie Team") { SlotList(title: "All-Rookie Team", slots: a.teams["allRookie"] ?? []) }
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Award race")
            .refreshable { await store.refresh() }
        }
    }
}

func numberText(_ v: Double) -> String {
    v.rounded() == v ? String(Int(v)) : String(format: "%.2f", v)
}

struct LeaderRow: View {
    let title: String
    let leader: Candidate
    let showShare: Bool
    var body: some View {
        HStack(spacing: 12) {
            if leader.id != nil { Headshot(url: leader.headshotURL) } else { TeamBadge(abbr: leader.team, size: 44) }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(leader.display).font(.headline)
                Text(leader.team + (leader.pos.map { " · \($0)" } ?? "")).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if showShare, let s = leader.share {
                Text(percent(s)).font(.title3.bold()).foregroundStyle(Color.accentColor)
            } else if let v = leader.value {
                Text(numberText(v)).font(.title3.bold())
            }
        }
    }
}

struct RaceDetail: View {
    let title: String
    let list: [Candidate]
    let shares: Bool
    var body: some View {
        List {
            ForEach(Array(list.enumerated()), id: \.element.uid) { i, c in
                HStack(spacing: 12) {
                    Text("\(i + 1)").font(.headline).foregroundStyle(.secondary).frame(width: 20)
                    if c.id != nil { Headshot(url: c.headshotURL) } else { TeamBadge(abbr: c.team, size: 44) }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.display).font(.headline)
                        if let l = c.line { Text(l).font(.caption).foregroundStyle(.secondary) }
                        if shares, let s = c.share { ShareBar(value: s) }
                    }
                    Spacer()
                    if shares, let s = c.share {
                        Text(percent(s)).bold()
                    } else if let v = c.value {
                        Text(numberText(v)).bold()
                    }
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SlotList: View {
    let title: String
    let slots: [Slot]
    var body: some View {
        List(slots) { s in
            HStack(spacing: 12) {
                Text(s.slot).font(.caption.bold()).frame(width: 28)
                Headshot(url: s.player.headshotURL)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.player.display).font(.headline)
                    Text(s.player.line ?? "").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
