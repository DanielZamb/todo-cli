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
    /// One part per target of the current kind (D2): two live actions on different targets that
    /// fail with the same kind are merged into one message instead of the later replacing the
    /// earlier. A different kind still replaces (newest wins).
    struct Part {
        let target: AnyHashable?
        let subject: String?
        let value: Value
        let sequence: Int
        /// The refusal's code and sentence, so a merge can say a shared reason once (D2 ruling:
        /// compared by code, not by sentence).
        var reasonCode: String? = nil
        var reasonText: String? = nil
        /// A Dependency change's verb and both Tasks, so merged hand-offs can name a shared Task.
        var attempt: LinkAttempt? = nil
    }
    private(set) var parts: [Part] = []
    private(set) var kind: Kind?
    private(set) var sequence = 0
    /// The instance's newest generation per kind, and per kind and target. A new surface instance is
    /// a new value with a new table, so a ticket from an earlier instance is never newest here.
    private let generations = Generations()
    /// How this surface merges same-kind parts; nil for a kind that does not merge.
    private let merge: (@Sendable (Kind, [Part]) -> Value?)?

    init(merge: (@Sendable (Kind, [Part]) -> Value?)? = nil) { self.merge = merge }

    struct TargetKey: Hashable { let kind: Kind; let target: AnyHashable }
    /// Shared by an instance and its tickets; used on the main actor only.
    final class Generations: @unchecked Sendable {
        fileprivate var newest: [Kind: Int] = [:]
        fileprivate var newestByTarget: [TargetKey: Int] = [:]
    }

    struct Ticket: Equatable {
        let kind: Kind
        /// What the action acts on (D1): the dependent Task of a link. Only a newer action of the
        /// same kind on the same target supersedes it. A navigation (it opens or replaces a sheet)
        /// has none: any newer navigation of its kind in the instance supersedes it.
        let target: AnyHashable?
        let generation: Int
        let mark: Int
        fileprivate let generations: Generations
        /// Whether no newer action of this kind (on this target) has started in this ticket's
        /// instance, whether or not that instance is still showing. Every presentation, in the
        /// surface or handed off to the main window, requires it.
        var isNewest: Bool {
            if let target { return generations.newestByTarget[TargetKey(kind: kind, target: target)] == generation }
            return generations.newest[kind] == generation
        }
        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.kind == rhs.kind && lhs.target == rhs.target && lhs.generation == rhs.generation && lhs.mark == rhs.mark && lhs.generations === rhs.generations
        }
    }

    /// The message shown: the only part, or this surface's merge of several same-kind parts.
    var value: Value? {
        guard let kind, let last = parts.last else { return nil }
        if parts.count == 1 { return last.value }
        return merge?(kind, parts) ?? last.value
    }

    /// The sequence an action notes at its start (for producers that do not take a ticket).
    var mark: Int { sequence }

    /// Starts an action of `kind` (on `target`); an older pending action of the same kind on the
    /// same target is superseded. Actions on different targets are both live (D1).
    mutating func begin(_ kind: Kind, target: AnyHashable? = nil) -> Ticket {
        let generation: Int
        if let target {
            let key = TargetKey(kind: kind, target: target)
            generation = (generations.newestByTarget[key] ?? 0) + 1
            generations.newestByTarget[key] = generation
        } else {
            generation = (generations.newest[kind] ?? 0) + 1
            generations.newest[kind] = generation
        }
        return Ticket(kind: kind, target: target, generation: generation, mark: sequence, generations: generations)
    }

    /// Whether the action is still the newest of its kind (on its target), and so may present.
    func isNewest(_ ticket: Ticket) -> Bool { ticket.generations === generations && ticket.isNewest }
    /// Starts an action that presents a clean surface at once (ends whatever was shown, then begins).
    mutating func beginClean(_ kind: Kind, target: AnyHashable? = nil) -> Ticket {
        end()
        return begin(kind, target: target)
    }
    /// Starts an action that presents at once: ends an earlier message of its own kind (on its
    /// target), then begins.
    mutating func restart(_ kind: Kind, target: AnyHashable? = nil) -> Ticket {
        clear([kind], since: sequence, onlyTarget: target)
        return begin(kind, target: target)
    }

    /// A success: clears this kind's message (its target's part) only if it existed when the action
    /// began, and says whether the action may present anything (it is still the newest).
    @discardableResult mutating func succeed(_ ticket: Ticket) -> Bool {
        guard isNewest(ticket) else { return false }
        clear([ticket.kind], since: ticket.mark, onlyTarget: ticket.target)
        return true
    }

    /// A failure: publishes only while the action is still the newest of its kind (on its target).
    /// `row` names the row the message belongs to when that differs from the ticket's target: a
    /// navigation is superseded across rows, but its message still ends with a later action on its
    /// row.
    @discardableResult mutating func fail(_ value: Value, _ ticket: Ticket, row: AnyHashable? = nil, subject: String? = nil, reasonCode: String? = nil, reasonText: String? = nil) -> Bool {
        guard isNewest(ticket) else { return false }
        publish(value, kind: ticket.kind, target: row ?? ticket.target, subject: subject, reasonCode: reasonCode, reasonText: reasonText)
        return true
    }

    /// Publishes a message. A same-kind message for another target merges with the one showing
    /// when this surface merges that kind; otherwise the newest replaces it.
    mutating func publish(_ value: Value, kind: Kind, target: AnyHashable? = nil, subject: String? = nil, reasonCode: String? = nil, reasonText: String? = nil, attempt: LinkAttempt? = nil) {
        sequence += 1
        let part = Part(target: target, subject: subject, value: value, sequence: sequence, reasonCode: reasonCode, reasonText: reasonText, attempt: attempt)
        let merges = kind == self.kind && target != nil && parts.allSatisfy { $0.target != nil }
            && merge?(kind, [part, part]) != nil
        if merges {
            parts.removeAll { $0.target == target }
            parts.append(part)
        } else {
            parts = [part]
            self.kind = kind
        }
    }

    /// Clears the current message's parts of one of `kinds` that existed at `mark` (only `onlyTarget`'s
    /// part when given).
    mutating func clear(_ kinds: Set<Kind>, since mark: Int, onlyTarget: AnyHashable? = nil) {
        guard let current = kind, kinds.contains(current) else { return }
        parts.removeAll { $0.sequence <= mark && (onlyTarget == nil || $0.target == onlyTarget) }
        if parts.isEmpty { kind = nil }
    }

    /// Clears the current message now if it is one of `kinds` (an action starting on a clean surface).
    mutating func clear(_ kinds: Set<Kind>, onlyTarget: AnyHashable? = nil) { clear(kinds, since: sequence, onlyTarget: onlyTarget) }

    /// Ends whatever message is showing (scope change, dismissal, the surface closing).
    mutating func end() { parts = []; kind = nil }

    /// The current message if it is of `kind`.
    func value(of kind: Kind) -> Value? { self.kind == kind ? value : nil }
}

/// Any surface's ticket, as the read-back owner and the hand-off ask it (S1-17, D1).
protocol SurfaceTicket { var isNewest: Bool { get }; var target: AnyHashable? { get } }

/// A Dependency change as a hand-off names it: its verb ("add" or "remove") and both Tasks.
struct LinkAttempt: Hashable {
    let verb: String
    let dependentID: String, dependent: String
    let blockerID: String, blocker: String
}

/// The contract's limits that messages state. `directDependencies` is `too_many_dependencies`'s
/// `details.limit` (an enum of one value in the OpenAPI contract); a state test reads the contract
/// and fails if they differ.
enum DependencyContract {
    static let directDependencies = 13
}

/// D2 wording, final words by the Opus Mac UI seat (candidate 8 review, 2026-11-12): several
/// same-kind failures on different Tasks read as one message naming them, up to three, then
/// "and N more".
enum MergedFailureWording {
    static let namedLimit = 3
    /// The closing sentence for a refusal code two links can realistically share. A code without
    /// one uses the caller's "see why" fallback.
    static let pluralReasons: [String: String] = [
        "dependency_cycle": "Each would create a loop. Choose other Tasks.",
        "too_many_dependencies": "A Task can have at most \(DependencyContract.directDependencies) direct Dependencies. Choose fewer.",
        "blocked": "Done Tasks can only depend on done or cancelled Tasks.",
        "dependency_profile_mismatch": "A Task and its Dependencies must be in the same Profile.",
        "occ_conflict": "These Tasks changed. Reload and try again.",
        "not_found": "These Tasks were deleted or moved.",
        "forbidden": "This credential can't change Dependencies.",
        "connection": "The server couldn't be reached. Try again.",
        "unavailable": "The server couldn't be reached. Try again.",
    ]
    /// The banner's head sentence for merged Dependency hand-offs. One verb and one shared Task:
    /// said as the single hand-off says it ("Couldn't make “R” depend on “A” and “B”.", and the
    /// mirrored forms). Otherwise the picker's form, "change" when the verbs differ.
    static func linkHead(_ attempts: [LinkAttempt?], subjects: [String?]) -> String {
        let known = attempts.compactMap { $0 }
        let verbs = Set(attempts.map { $0?.verb ?? "change" })
        if known.count == attempts.count, verbs.count == 1, let verb = verbs.first, verb == "add" || verb == "remove" {
            if Set(known.map(\.dependentID)).count == 1, let shared = known.first?.dependent {
                let others = names(known.map(\.blocker))
                return verb == "add" ? "Couldn't make \u{201C}\(shared)\u{201D} depend on \(others)." : "Couldn't stop \u{201C}\(shared)\u{201D} depending on \(others)."
            }
            if Set(known.map(\.blockerID)).count == 1, let shared = known.first?.blocker {
                let others = names(known.map(\.dependent))
                return verb == "add" ? "Couldn't make \(others) depend on \u{201C}\(shared)\u{201D}." : "Couldn't stop \(others) depending on \u{201C}\(shared)\u{201D}."
            }
        }
        let verb = verbs.count == 1 ? verbs.first! : "change"
        return "Couldn't \(verb) \(attempts.count) Dependencies: \(names(subjects))."
    }
    /// The closing sentence: when every part was refused with the same code (compared by code, not
    /// by sentence) and that code has a plural sentence, that sentence; otherwise `differing`.
    static func reason(codes: [String?], differing: String) -> String {
        if let first = codes.first, let code = first, codes.allSatisfy({ $0 == code }), let plural = pluralReasons[code] { return plural }
        return differing
    }
    static func names(_ subjects: [String?]) -> String {
        let named = subjects.compactMap { $0 }.map { "\u{201C}\($0)\u{201D}" }
        let shown = Array(named.prefix(namedLimit))
        let more = subjects.count - shown.count
        if more > 0 { return shown.joined(separator: ", ") + " and \(more) more" }
        if shown.count <= 1 { return shown.joined() }
        return shown.dropLast().joined(separator: ", ") + " and " + shown.last!
    }
}
extension SurfaceMessages.Ticket: SurfaceTicket {}
