import Foundation

/// The message rule for one surface: the main window, or one instance of a sheet, picker, dialog,
/// editor or report (MAC-C1-S1-09 and S1-15). One helper for every surface:
///
/// - Every message has a kind and a sequence number that only grows within the surface.
/// - An action takes a ticket when it starts (`begin`): its kind, a generation of that kind, and
///   the sequence mark at that moment.
/// - A newer action of the same kind supersedes an older one still pending: the older one's data
///   result still applies if it committed something, but it presents nothing (no message, no
///   clearing, no opening or closing).
/// - On success (`succeed`) an action clears only a message of its own kind that already existed
///   when it started; anything published after it began survives.
/// - On failure (`fail`) an action publishes only while it is still the newest of its kind.
/// - Nothing older replaces or clears something newer; nothing saves or restores a message.
///
/// A new surface instance starts with a new value of this type.
struct SurfaceMessages<Kind: Hashable, Value> {
    private(set) var value: Value?
    private(set) var kind: Kind?
    private(set) var sequence = 0
    private var newest: [Kind: Int] = [:]
    /// A new surface instance is a new value; a ticket from an earlier instance is never newest.
    private let instance = UUID()

    struct Ticket: Equatable {
        let kind: Kind
        let generation: Int
        let mark: Int
        fileprivate let instance: UUID
    }

    /// The sequence an action notes at its start (for producers that do not take a ticket).
    var mark: Int { sequence }

    /// Starts an action of `kind`; any older pending action of the same kind is superseded.
    mutating func begin(_ kind: Kind) -> Ticket {
        let generation = (newest[kind] ?? 0) + 1
        newest[kind] = generation
        return Ticket(kind: kind, generation: generation, mark: sequence, instance: instance)
    }

    /// Whether the action is still the newest of its kind, and so may present.
    func isNewest(_ ticket: Ticket) -> Bool { ticket.instance == instance && newest[ticket.kind] == ticket.generation }
    /// Starts an action that presents a clean surface at once (ends whatever was shown, then begins).
    mutating func beginClean(_ kind: Kind) -> Ticket {
        end()
        return begin(kind)
    }
    /// Starts an action that presents at once: ends an earlier message of its own kind, then begins.
    mutating func restart(_ kind: Kind) -> Ticket {
        clear([kind], since: sequence)
        return begin(kind)
    }

    /// A success: clears this kind's message only if it existed when the action began, and says
    /// whether the action may present anything (it is still the newest of its kind).
    @discardableResult mutating func succeed(_ ticket: Ticket) -> Bool {
        guard isNewest(ticket) else { return false }
        if value != nil, kind == ticket.kind, sequence <= ticket.mark { value = nil; kind = nil }
        return true
    }

    /// A failure: publishes only while the action is still the newest of its kind.
    @discardableResult mutating func fail(_ value: Value, _ ticket: Ticket) -> Bool {
        guard isNewest(ticket) else { return false }
        publish(value, kind: ticket.kind)
        return true
    }

    /// Publishes a message from a producer that takes no ticket (a synchronous check, say).
    mutating func publish(_ value: Value, kind: Kind) {
        sequence += 1
        self.value = value
        self.kind = kind
    }

    /// Clears the current message if it is one of `kinds` and existed at `mark`.
    mutating func clear(_ kinds: Set<Kind>, since mark: Int) {
        guard value != nil, let current = kind, kinds.contains(current), sequence <= mark else { return }
        value = nil; kind = nil
    }

    /// Clears the current message now if it is one of `kinds` (an action starting on a clean surface).
    mutating func clear(_ kinds: Set<Kind>) { clear(kinds, since: sequence) }

    /// Ends whatever message is showing (scope change, dismissal, the surface closing).
    mutating func end() { value = nil; kind = nil }

    /// The current message if it is of `kind`.
    func value(of kind: Kind) -> Value? { self.kind == kind ? value : nil }
}
