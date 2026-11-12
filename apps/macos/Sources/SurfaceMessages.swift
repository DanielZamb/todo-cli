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
///
/// Supersession is decided first and is final (MAC-C1-S1-16): a ticket carries its instance's
/// generation table, so it can still answer `isNewest` after its surface has closed. An action
/// superseded while its surface was open presents nothing anywhere: not in the surface, not as a
/// hand-off to the main window, not as a quiet confirmation.
struct SurfaceMessages<Kind: Hashable, Value> {
    private(set) var value: Value?
    private(set) var kind: Kind?
    private(set) var sequence = 0
    /// The instance's newest generation per kind. A new surface instance is a new value with a new
    /// table, so a ticket from an earlier instance is never newest here.
    private let generations = Generations()

    /// Shared by an instance and its tickets; used on the main actor only.
    final class Generations: @unchecked Sendable {
        fileprivate var newest: [Kind: Int] = [:]
    }

    struct Ticket: Equatable {
        let kind: Kind
        let generation: Int
        let mark: Int
        fileprivate let generations: Generations
        /// Whether no newer action of this kind has started in this ticket's instance, whether or
        /// not that instance is still showing. Every presentation, in the surface or handed off
        /// to the main window, requires it.
        var isNewest: Bool { generations.newest[kind] == generation }
        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.kind == rhs.kind && lhs.generation == rhs.generation && lhs.mark == rhs.mark && lhs.generations === rhs.generations
        }
    }

    /// The sequence an action notes at its start (for producers that do not take a ticket).
    var mark: Int { sequence }

    /// Starts an action of `kind`; any older pending action of the same kind is superseded.
    mutating func begin(_ kind: Kind) -> Ticket {
        let generation = (generations.newest[kind] ?? 0) + 1
        generations.newest[kind] = generation
        return Ticket(kind: kind, generation: generation, mark: sequence, generations: generations)
    }

    /// Whether the action is still the newest of its kind, and so may present.
    func isNewest(_ ticket: Ticket) -> Bool { ticket.generations === generations && ticket.isNewest }
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
