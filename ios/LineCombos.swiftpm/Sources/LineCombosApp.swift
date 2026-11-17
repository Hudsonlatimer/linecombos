import SwiftUI

@main
struct LineCombosApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            TabView {
                TodayView().tabItem { Label("Predictions", systemImage: "chart.bar.fill") }
                AwardsView().tabItem { Label("Awards", systemImage: "trophy.fill") }
                StandingsView().tabItem { Label("Standings", systemImage: "list.number") }
            }
            .environmentObject(store)
            .task { await store.autoRefresh() }
        }
    }
}
