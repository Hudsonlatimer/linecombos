import SwiftUI

/// A team shown as its abbreviation on a colour taken from the name, since the NHL's logos are SVG files.
struct TeamBadge: View {
    let abbr: String
    var size: CGFloat = 36
    private var hue: Double { Double(abbr.unicodeScalars.reduce(7) { ($0 &* 31 &+ Int($1.value)) % 360 }) / 360 }
    var body: some View {
        Text(abbr)
            .font(.system(size: size * 0.34, weight: .heavy, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hue: hue, saturation: 0.55, brightness: 0.55), in: Circle())
    }
}

struct Headshot: View {
    let url: URL?
    var size: CGFloat = 44
    var body: some View {
        AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
            .frame(width: size, height: size)
            .clipShape(Circle())
    }
}

struct ShareBar: View {
    let value: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.2))
                Capsule().fill(Color.accentColor).frame(width: max(4, g.size.width * value))
            }
        }
        .frame(height: 6)
    }
}

func percent(_ x: Double) -> String { x >= 0.995 ? "99%" : x < 0.01 ? "<1%" : "\(Int((x * 100).rounded()))%" }
