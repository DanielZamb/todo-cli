import SwiftUI

private final class TodoResourceBundle: NSObject {}

enum TodoColors {
    static var bundle: Bundle { Bundle(for: TodoResourceBundle.self) }
    static func color(_ name: String) -> Color { Color(name, bundle: bundle) }
}
