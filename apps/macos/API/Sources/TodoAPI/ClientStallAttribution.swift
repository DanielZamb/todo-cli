import ClientStallSampling
import Darwin
import Foundation

/// One frame of a stall sample, as kept in the journal: the image's base name and, for our own
/// frames and the top six system frames, the demangled symbol. No address, offset, path or data.
public struct ClientStallFrame: Codable, Sendable, Equatable {
    public var image: String
    public var symbol: String?
    public var own: Bool
    public init(image: String, symbol: String?, own: Bool) { self.image = image; self.symbol = symbol; self.own = own }
}

/// What the main thread was doing during one stall (approved design, candidate 8).
public struct ClientStallAttribution: Codable, Sendable, Equatable {
    /// Samples taken during the stall (every 50 ms after the first 100 ms, at most 20).
    public var samples: Int
    /// The deepest of our frames that is not a thunk, or the system entry when no frame is ours,
    /// in the sample that most samples agree on.
    public var inLabel: String?
    /// How many samples carry `inLabel`.
    public var agreeing: Int
    /// The representative sample's kept frames, innermost first.
    public var frames: [ClientStallFrame]
    /// Why sampling is off for the rest of this run (a failure or a window over 1 ms), if it is.
    public var disabled: String?
    /// How long each suspension held the main thread, in microseconds, in order, measured from
    /// before the suspend call to after the resume (conservative, S1-25): what the sampler cost this
    /// stall. It includes a window that turned sampling off. Absent in records written before it.
    public var suspendedMicroseconds: [Int]?
    /// The same cost summarised for the journal: how many suspensions, their total and the longest.
    public var suspensions: Int?
    public var suspendedTotalMicroseconds: Int?
    public var suspendedLongestMicroseconds: Int?
    public init(samples: Int, inLabel: String?, agreeing: Int, frames: [ClientStallFrame], disabled: String?, suspendedMicroseconds: [Int]? = nil) {
        self.samples = samples; self.inLabel = inLabel; self.agreeing = agreeing; self.frames = frames; self.disabled = disabled
        self.suspendedMicroseconds = suspendedMicroseconds
        suspensions = suspendedMicroseconds?.count
        suspendedTotalMicroseconds = suspendedMicroseconds?.reduce(0, +)
        suspendedLongestMicroseconds = suspendedMicroseconds?.max()
    }
}

/// A symbolized frame before the privacy reduction.
public struct ClientStallSymbol: Sendable, Equatable {
    public var imagePath: String
    public var symbol: String?
    public var own: Bool
    public init(imagePath: String, symbol: String?, own: Bool) { self.imagePath = imagePath; self.symbol = symbol; self.own = own }
}

public enum ClientStallAttributor {
    /// System frames kept per sample, counted from the innermost.
    public static let systemFramesKept = 6
    /// Our own frames kept per sample, from the innermost (fewer when the record would exceed
    /// `recordLimit`).
    public static let ownFramesKept = 20
    /// The approved bound on one stall's attribution, in encoded bytes.
    public static let recordLimit = 3_500
    /// Longest symbol kept, in characters.
    public static let symbolLimit = 160
    /// The UI frameworks whose innermost frame names a stall with no frame of ours.
    public static let systemEntries: Set<String> = ["SwiftUI", "SwiftUICore", "AppKit", "AttributeGraph", "CoreFoundation", "QuartzCore", "Foundation"]

    public static func isThunk(_ symbol: String) -> Bool {
        let lowered = symbol.lowercased()
        return lowered.contains("thunk") || lowered.hasPrefix("partial apply") || lowered.contains("reabstraction")
            || lowered.hasPrefix("outlined ") || lowered.hasPrefix("merged ") || lowered.hasPrefix("closure #") && lowered.contains("thunk")
    }

    static func baseName(_ path: String) -> String { (path as NSString).lastPathComponent }
    public static func encodedSize(_ record: ClientStallAttribution) -> Int { (try? JSONEncoder().encode(record).count) ?? Int.max }

    static func clip(_ symbol: String?) -> String? {
        guard let symbol else { return nil }
        return symbol.count > symbolLimit ? String(symbol.prefix(symbolLimit - 1)) + "…" : symbol
    }

    /// The label for one sample, innermost frame first.
    public static func label(_ stack: [ClientStallSymbol]) -> String? {
        if let own = stack.first(where: { $0.own && $0.symbol.map { !isThunk($0) } == true }) {
            return clip(own.symbol)
        }
        if let entry = stack.first(where: { systemEntries.contains(baseName($0.imagePath)) }) {
            return clip(entry.symbol.map { "\(baseName(entry.imagePath)): \($0)" } ?? baseName(entry.imagePath))
        }
        return stack.first.map { baseName($0.imagePath) }
    }

    /// The kept frames of one sample: every own frame (up to `ownFramesKept`) with its symbol,
    /// the innermost `systemFramesKept` system frames with theirs, and nothing for other system
    /// frames, which are dropped.
    public static func kept(_ stack: [ClientStallSymbol]) -> [ClientStallFrame] {
        var own = 0, system = 0
        var frames: [ClientStallFrame] = []
        for frame in stack {
            if frame.own {
                guard own < ownFramesKept else { continue }
                own += 1
                frames.append(.init(image: baseName(frame.imagePath), symbol: clip(frame.symbol), own: true))
            } else if system < systemFramesKept {
                system += 1
                frames.append(.init(image: baseName(frame.imagePath), symbol: clip(frame.symbol), own: false))
            }
        }
        return frames
    }

    /// Reduces a stall's samples to one bounded record.
    public static func attribute(_ stacks: [[ClientStallSymbol]], disabled: String?, suspendedMicroseconds: [Int]? = nil) -> ClientStallAttribution {
        let labels = stacks.map(label)
        var counts: [String: Int] = [:]
        for case let label? in labels { counts[label, default: 0] += 1 }
        // The most common label; ties go to the earliest sample that carries one.
        let best = labels.compactMap { $0 }.max { (counts[$0] ?? 0) < (counts[$1] ?? 0) }
        let chosen = best.flatMap { winner in labels.firstIndex(of: winner) }
        var record = ClientStallAttribution(samples: stacks.count, inLabel: best, agreeing: best.map { counts[$0] ?? 0 } ?? 0,
                                            frames: chosen.map { kept(stacks[$0]) } ?? [], disabled: disabled, suspendedMicroseconds: suspendedMicroseconds)
        // Keep the record within its bound: drop the outermost own frames first, then the
        // outermost system frames.
        while encodedSize(record) > recordLimit, !record.frames.isEmpty {
            if let index = record.frames.lastIndex(where: { $0.own }) { record.frames.remove(at: index) } else { record.frames.removeLast() }
        }
        return record
    }
}

/// Samples the main thread while it is stalled. Every method after `init` runs on one serial queue
/// only, for the sampler's whole life (MAC-C1-S1-21: the monitor owns that queue and never makes
/// another); `init` runs on the main thread to capture its port.
public final class ClientStallSampler: @unchecked Sendable {
    public static let capacity = 20
    /// The approved cadence: the first sample once the ping is 100 ms late, then every 50 ms.
    public static let firstAfterMS = 100.0
    public static let intervalMS = 50.0
    /// A suspended window longer than this turns sampling off for the run.
    public static let windowLimitNS: UInt64 = 1_000_000
    /// The most a stall's samples may hold the main thread suspended in all. Checked before each
    /// suspend: a sample starts only if a window as long as the limit would still fit, so one stall
    /// costs at most this plus whatever the last window overran the limit by. A single window has
    /// no hard maximum from user space (the kernel can preempt the sampling thread mid-window);
    /// the watchdog queue runs at user-interactive QoS to make that rare, and every window is
    /// recorded so Diagnostics shows the cost.
    public static let stallBudgetNS: UInt64 = 2_000_000
    private let windowLimitNS: UInt64
    private let ownImages: [String]
    private let thread: thread_act_t
    private let buffer: UnsafeMutablePointer<todo_stall_sample>
    private let timebase: mach_timebase_info_data_t
    private var stall: UUID?
    private var taken = 0
    private var lastSampleMS = 0.0
    /// This stall's suspended windows (ns), and their sum.
    private var windows: [UInt64] = []
    private var spentNS: UInt64 = 0
    /// At most this many attributed stalls an hour; later stalls are recorded without one.
    public static let perHour = 120
    private var hourStartMS = -Double.infinity
    private var attributedThisHour = 0
    public private(set) var disabled: String?
    /// Samples taken since this sampler was made (for the idle checks).
    public private(set) var samplesTaken = 0

    /// Samples the calling (main) thread. `ownImages` are the paths whose frames count as ours
    /// (default: the app bundle).
    @MainActor public convenience init(ownImages: [String]? = nil) {
        self.init(thread: mach_thread_self(), ownImages: ownImages ?? [Bundle.main.bundleURL.resolvingSymlinksInPath().path], windowLimitNS: Self.windowLimitNS)
    }
    /// For the failing-first controls: a given thread port (owned by the sampler) and window limit.
    public init(thread: thread_act_t, ownImages: [String], windowLimitNS: UInt64) {
        self.thread = thread
        self.ownImages = ownImages
        self.windowLimitNS = windowLimitNS
        buffer = .allocate(capacity: Self.capacity)
        buffer.initialize(repeating: todo_stall_sample(), count: Self.capacity)
        windows.reserveCapacity(Self.capacity)
        var base = mach_timebase_info_data_t()
        mach_timebase_info(&base)
        timebase = base
        if todo_sampling_supported() == 0 { disabled = "unsupported architecture (stall sampling is arm64 only)" }
    }
    deinit {
        buffer.deinitialize(count: Self.capacity)
        buffer.deallocate()
        _ = mach_port_deallocate(mach_task_self_, thread)
    }

    /// Drops the stall in progress, unfinished (the monitor stopping). The hourly count is kept, so the
    /// cap of `perHour` attributed stalls an hour holds across a stop and a start.
    public func abandon() { stall = nil; taken = 0; lastSampleMS = 0; windows.removeAll(keepingCapacity: true); spentNS = 0 }

    /// Called on every watchdog tick with how long the main thread's ping has been pending.
    /// Takes a sample when one is due; returns whether it did.
    @discardableResult public func tick(stall id: UUID, pendingMS: Double, nowMS: Double) -> Bool {
        guard disabled == nil, pendingMS > Self.firstAfterMS else { return false }
        if stall != id { stall = id; taken = 0; lastSampleMS = 0; windows.removeAll(keepingCapacity: true); spentNS = 0 }
        // The count is read once and every buffer use is checked against that one value.
        let index = taken
        guard index >= 0, index < Self.capacity, index == 0 || nowMS - lastSampleMS >= Self.intervalMS else { return false }
        // The stall's time budget, before the suspend: start only if a full-limit window still fits.
        guard spentNS + windowLimitNS <= Self.stallBudgetNS else { return false }
        let slot = buffer.advanced(by: index)
        let status = Int(todo_sample_thread(thread, slot))
        // Conservative: from before the suspend call to after the resume (S1-25). Every suspension
        // that happened is recorded, even one that turns sampling off.
        let windowNS = slot.pointee.suspended_ticks * UInt64(timebase.numer) / UInt64(max(timebase.denom, 1))
        if windowNS > 0 { windows.append(windowNS); spentNS += windowNS }
        if status != Int(TODO_SAMPLE_OK) {
            disabled = "sample failed with status \(status)"
            return false
        }
        if windowNS > windowLimitNS {
            disabled = "a suspended window took \(windowNS / 1000) µs (limit 1,000 µs)"
            return false
        }
        taken = index + 1
        samplesTaken += 1
        lastSampleMS = nowMS
        return true
    }

    /// Ends the stall: symbolicates its samples (off the main thread, after every resume) and
    /// returns one bounded record, or nil when the stall took no sample.
    public func finish(stall id: UUID, nowMS: Double) -> ClientStallAttribution? {
        defer { if stall == id { stall = nil; taken = 0; windows.removeAll(keepingCapacity: true); spentNS = 0 } }
        let count = taken
        let sampled = stall == id && count > 0 && count <= Self.capacity
        guard sampled || disabled != nil else { return nil }
        // MAC-C1-S1-22: the hourly budget comes before every outcome, a disabled one included.
        if nowMS - hourStartMS >= 3_600_000 { hourStartMS = nowMS; attributedThisHour = 0 }
        guard attributedThisHour < Self.perHour else { return nil }
        attributedThisHour += 1
        let suspended = stall == id ? windows.map { Int($0 / 1000) } : []
        guard sampled else { return disabled.map { .init(samples: 0, inLabel: nil, agreeing: 0, frames: [], disabled: $0, suspendedMicroseconds: suspended.isEmpty ? nil : suspended) } }
        var stacks: [[ClientStallSymbol]] = []
        for index in 0..<count {
            let sample = buffer.advanced(by: index).pointee
            let frames = Int(sample.count)
            let walked = withUnsafeBytes(of: sample.pcs) { bytes in
                let pcs = bytes.bindMemory(to: UInt64.self)
                return Array(pcs.prefix(max(0, min(frames, pcs.count))))
            }
            let pcs = ClientStallStack.assemble(pcs: walked, lr: sample.lr, functionStart: ClientStallSymbolizer.functionStart)
            stacks.append(pcs.enumerated().map { offset, pc in ClientStallSymbolizer.symbol(pc, isReturnAddress: offset > 0, ownImages: ownImages) })
        }
        return ClientStallAttributor.attribute(stacks, disabled: disabled, suspendedMicroseconds: suspended)
    }
}

/// Where the link register goes in a sampled stack (coordinator ruling, 2026-11-12).
///
/// A leaf that has not pushed a frame record has its caller only in LR, so the frame-pointer walk
/// begins at the caller's caller. But once a function has pushed its frame, LR points back into
/// that same function (after its last call returned) or equals the saved return address; inserting
/// it then adds a duplicate, or a wrong caller if LR was reused. The rule: with LR stripped of its
/// pointer-authentication bits exactly as the saved return addresses are, insert it after the pc
/// only when (a) it differs from the first saved return address and (b) it does not resolve into
/// the same function as the pc. Otherwise skip it.
///
/// Not provable from a sample: a reused LR that happens to resolve into another function is
/// inserted as a caller. The stall's label therefore still needs the samples to agree.
public enum ClientStallStack {
    public static func assemble(pcs: [UInt64], lr: UInt64, functionStart: (UInt64) -> UInt64?) -> [UInt64] {
        guard lr != 0, let pc = pcs.first else { return pcs }
        if pcs.count > 1, pcs[1] == lr { return pcs }                         // (a) already the saved return address
        // A return address points just after the call: look up the call itself.
        if let own = functionStart(pc), let caller = functionStart(lr &- 1), own == caller { return pcs }   // (b) inside the pc's own function
        var stack = pcs
        stack.insert(lr, at: 1)
        return stack
    }
}

/// dladdr and the Swift demangler, used only after the sampled thread has been resumed.
enum ClientStallSymbolizer {
    /// The start of the function containing `address`, or nil when it cannot be resolved.
    static func functionStart(_ address: UInt64) -> UInt64? {
        var info = Dl_info()
        guard dladdr(UnsafeRawPointer(bitPattern: UInt(address)), &info) != 0, let start = info.dli_saddr else { return nil }
        return UInt64(UInt(bitPattern: start))
    }
    private typealias Demangle = @convention(c) (UnsafePointer<CChar>?, Int, UnsafeMutablePointer<CChar>?, UnsafeMutablePointer<Int>?, UInt32) -> UnsafeMutablePointer<CChar>?
    private static let demangler: Demangle? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "swift_demangle").map { unsafeBitCast($0, to: Demangle.self) }
    static func symbol(_ pc: UInt64, isReturnAddress: Bool, ownImages: [String]) -> ClientStallSymbol {
        // A return address points after the call; look up the call itself.
        let address = isReturnAddress && pc > 0 ? pc - 1 : pc
        var info = Dl_info()
        guard dladdr(UnsafeRawPointer(bitPattern: UInt(address)), &info) != 0, let file = info.dli_fname else {
            return .init(imagePath: "unknown", symbol: nil, own: false)
        }
        let path = String(cString: file)
        let own = ownImages.contains { path == $0 || path.hasPrefix($0 + "/") }
        return .init(imagePath: path, symbol: info.dli_sname.map { demangle(String(cString: $0)) }, own: own)
    }

    static func demangle(_ name: String) -> String {
        guard let demangler, name.hasPrefix("$s") || name.hasPrefix("_$s") else { return name }
        let mangled = name.hasPrefix("_") ? String(name.dropFirst()) : name
        return mangled.withCString { pointer in
            guard let result = demangler(pointer, strlen(pointer), nil, nil, 0) else { return name }
            defer { free(result) }
            return String(cString: result)
        }
    }
}
