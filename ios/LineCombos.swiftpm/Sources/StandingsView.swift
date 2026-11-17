import SwiftUI

struct StandingsView: View {
    @EnvironmentObject var store: Store
    @State private var mode = 0   // 0 division, 1 conference, 2 league

    private var sections: [(name: String, rows: [TeamRow])] {
        let rows = store.standings
        func group(_ key: (TeamRow) -> String) -> [(name: String, rows: [TeamRow])] {
            Dictionary(grouping: rows, by: key).sorted { $0.key < $1.key }.map { (name: $0.key, rows: $0.value.sorted { $0.points > $1.points }) }
        }
        switch mode {
        case 0: return group { $0.divisionName }
        case 1: return group { $0.conferenceName }
        default: return [(name: "NHL", rows: rows.sorted { $0.points > $1.points })]
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Picker("Group", selection: $mode) {
                    Text("Division").tag(0)
                    Text("Conference").tag(1)
                    Text("League").tag(2)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                ForEach(sections, id: \.name) { section in
                    Section(section.name) {
                        ForEach(Array(section.rows.enumerated()), id: \.element.id) { i, t in
                            HStack(spacing: 10) {
                                Text("\(i + 1)").foregroundStyle(.secondary).frame(width: 22)
                                TeamBadge(abbr: t.abbr, size: 30)
                                Text(t.teamName.default).lineLimit(1)
                                Spacer()
                                Text("\(t.wins)-\(t.losses)-\(t.otLosses)").font(.caption).foregroundStyle(.secondary)
                                Text("\(t.points)").bold().frame(width: 34, alignment: .trailing)
                            }
                        }
                    }
                }
            }
            .overlay { if store.standings.isEmpty { ProgressView() } }
            .navigationTitle("Standings")
            .refreshable { await store.refresh() }
        }
    }
}
