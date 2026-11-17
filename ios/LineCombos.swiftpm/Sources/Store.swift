import Foundation
import SwiftUI

/// Loads everything from the site and the NHL. Pull to refresh, and it refreshes itself every minute while open.
@MainActor
final class Store: ObservableObject {
    static let site = "https://linecombos.vercel.app"

    @Published var games: [PGame] = []
    @Published var awards: Awards?
    @Published var standings: [TeamRow] = []
    @Published var updated: Date?
    @Published var error: String?

    private let decoder = JSONDecoder()

    func fetch<T: Decodable>(_ type: T.Type, _ url: String) async throws -> T {
        var req = URLRequest(url: URL(string: url)!)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, _) = try await URLSession.shared.data(for: req)
        return try decoder.decode(T.self, from: data)
    }

    func refresh() async {
        async let p = try? fetch(Predictions.self, "\(Store.site)/data/predictions.json")
        async let a = try? fetch(Awards.self, "\(Store.site)/data/awards.json")
        async let s = try? fetch(StandingsResponse.self, "https://api-web.nhle.com/v1/standings/now")
        let (pred, aw, st) = await (p, a, s)
        if let pred { games = pred.games.values.sorted { ($0.start ?? "", $0.id) < ($1.start ?? "", $1.id) } }
        if let aw { awards = aw }
        if let st { standings = st.standings }
        error = (pred == nil && aw == nil && st == nil) ? "Couldn't reach the site. Check your connection." : nil
        updated = Date()
    }

    func autoRefresh() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: .seconds(60))
        }
    }
}
