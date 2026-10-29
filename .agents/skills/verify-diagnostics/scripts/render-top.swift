import AppKit
import Foundation

NSApplication.shared.setActivationPolicy(.prohibited)
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
for (suffix, columns, rows, file) in [("", 128, 44, "top-full.txt"), ("-compact", 80, 24, "top-compact.txt")] {
let text = try String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8)
let lines = text.components(separatedBy: .newlines)
let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
let width = Double(columns) * 7.3 + 36.0
let height = Double(lines.count) * 17 + 72
for dark in [false, true] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(width * 2), pixelsHigh: Int(height * 2), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    bitmap.size = NSSize(width: width, height: height)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor(srgbRed: dark ? 0.09 : 0.97, green: dark ? 0.115 : 0.975, blue: dark ? 0.10 : 0.96, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    let foreground = dark ? NSColor(srgbRed: 0.94, green: 0.95, blue: 0.94, alpha: 1) : NSColor(srgbRed: 0.086, green: 0.114, blue: 0.098, alpha: 1)
    let accent = dark ? NSColor(srgbRed: 0.65, green: 0.84, blue: 0.72, alpha: 1) : NSColor(srgbRed: 0.16, green: 0.365, blue: 0.275, alpha: 1)
    ("todo top  ·  live PTY capture  ·  \(columns) × \(rows)" as NSString).draw(at: NSPoint(x: 18, y: height - 32), withAttributes: [.font: font, .foregroundColor: accent])
    for (index, line) in lines.enumerated() {
        (line as NSString).draw(at: NSPoint(x: 18, y: height - 62 - Double(index) * 17), withAttributes: [.font: font, .foregroundColor: line.contains("┌") || line.contains("╔") || index == 0 ? accent : foreground])
    }
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent("top\(suffix)-\(dark ? "dark" : "light").png"))
}

}
