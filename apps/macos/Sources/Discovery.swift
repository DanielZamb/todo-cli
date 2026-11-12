import Foundation
import Observation
import TodoAPI

struct DiscoveryName: Codable, Equatable, Identifiable {
    let id: String
    let name: String
}

struct ProfileDirectoryEntry: Codable, Identifiable {
    let id: String
    let name: String
    let projects: [DiscoveryName]
}

struct TaskLookupMatch: Codable, Equatable, Identifiable {
    let profile: DiscoveryName
    let task_id: String
    let title: String
    let project: String?
    var id: String { task_id }
}

enum DiscoveryDialog: String, Identifiable { case directory, lookup; var id: String { rawValue } }
enum DiscoveryPhase { case closed, editing, invalid, requesting, showing, empty, error, offline }

struct DiscoveryIdentity: Equatable {
    let credentialEpoch: Int
    let generation: Int
    let dialog: DiscoveryDialog
    let prefix: String
}

struct DiscoverySnapshot {
    let appliedIdentity: DiscoveryIdentity
    var profiles: [ProfileDirectoryEntry] = []
    var matches: [TaskLookupMatch] = []
}

struct DiscoveryShowIntent: Equatable {
    let id = UUID()
    let identity: DiscoveryIdentity
    let match: TaskLookupMatch
}

@MainActor @Observable
final class DiscoveryState {
    var dialog: DiscoveryDialog?
    var phase = DiscoveryPhase.closed
    var prefix = ""
    var error: String?
    var appliedSnapshot: DiscoverySnapshot?
    var requestedIdentity: DiscoveryIdentity?
    var generation = 0
    var credentialEpoch = 0
    var showIntent: DiscoveryShowIntent?
    var copiedID: String?
    var validPrefix: Bool { !prefix.isEmpty && TaskListFilters(prefix: prefix).prefixIsValid }

    func invalidate() {
        generation += 1
        appliedSnapshot = nil
        requestedIdentity = nil
        showIntent = nil
        error = nil
        copiedID = nil
    }

    func credentialChanged() {
        credentialEpoch += 1
        invalidate()
        dialog = nil
        phase = .closed
    }
}

extension TodoModel {
    func openDiscovery(_ dialog: DiscoveryDialog) async {
        discovery.invalidate()
        discovery.dialog = dialog
        discovery.prefix = ""
        discovery.phase = .editing
        if dialog == .directory { await requestDiscovery() }
    }

    func closeDiscovery() {
        if case .showDiscovery = pendingNavigation { pendingNavigation = nil }
        discovery.invalidate()
        discovery.dialog = nil
        discovery.phase = .closed
    }

    func editDiscoveryPrefix(_ value: String) {
        guard discovery.prefix != value else { return }
        discovery.invalidate()
        discovery.prefix = value
        discovery.phase = .editing
    }

    func discoveryWentOffline() {
        guard discovery.dialog != nil || discovery.showIntent != nil else { return }
        let submitted = discovery.requestedIdentity
        discovery.invalidate()
        discovery.requestedIdentity = submitted
        discovery.phase = .offline
    }

    func requestDiscovery(retry: Bool = false) async {
        guard let dialog = discovery.dialog, discovery.phase != .requesting else { return }
        if retry && discovery.phase != .error && discovery.phase != .offline { return }
        let prefix: String
        if retry && dialog == .lookup {
            guard let submitted = discovery.requestedIdentity,
                  submitted.credentialEpoch == discovery.credentialEpoch,
                  submitted.dialog == dialog, submitted.prefix == discovery.prefix else { return }
            prefix = submitted.prefix
        } else { prefix = discovery.prefix }
        if dialog == .lookup && !discovery.validPrefix {
            discovery.invalidate()
            discovery.phase = .invalid
            discovery.error = "Enter 1 to 36 hexadecimal digits or hyphens."
            return
        }
        discovery.invalidate()
        guard signedIn, connection == .live, outdatedServerBuild == nil else { discovery.phase = .offline; return }
        let identity = DiscoveryIdentity(credentialEpoch: discovery.credentialEpoch, generation: discovery.generation, dialog: dialog, prefix: prefix)
        discovery.requestedIdentity = identity
        discovery.phase = .requesting
        do {
            let snapshot: DiscoverySnapshot
            if dialog == .directory {
                let wire = try await client.reads_period_profiles(query: .init(include_projects: ._true)).ok.body.json
                let profiles = try JSONDecoder().decode([ProfileDirectoryEntry].self, from: JSONEncoder().encode(wire))
                snapshot = .init(appliedIdentity: identity, profiles: profiles)
            } else {
                let wire = try await client.reads_period_lookup(query: .init(prefix: prefix)).ok.body.json
                let matches = try JSONDecoder().decode([TaskLookupMatch].self, from: JSONEncoder().encode(wire))
                snapshot = .init(appliedIdentity: identity, matches: matches)
            }
            guard canPublishDiscovery(identity) else { return }
            discovery.appliedSnapshot = snapshot
            discovery.phase = snapshot.profiles.isEmpty && snapshot.matches.isEmpty ? .empty : .showing
        } catch {
            if discovery.credentialEpoch == identity.credentialEpoch { handleAuthorization(error, credentialEpoch: identity.credentialEpoch) }
            guard canPublishDiscovery(identity) else { return }
            discovery.error = describe(error, at: .discovery)
            discovery.phase = .error
        }
    }

    func canPublishDiscovery(_ identity: DiscoveryIdentity) -> Bool {
        signedIn && connection == .live && !Task.isCancelled && discovery.credentialEpoch == identity.credentialEpoch && discovery.generation == identity.generation && discovery.dialog == identity.dialog && discovery.requestedIdentity == identity && (identity.dialog == .directory || discovery.prefix == identity.prefix)
    }

    func showDiscoveryMatch(_ match: TaskLookupMatch) async -> Bool {
        guard let snapshot = discovery.appliedSnapshot, canPublishDiscovery(snapshot.appliedIdentity), snapshot.matches.contains(match) else { return false }
        let intent = DiscoveryShowIntent(identity: snapshot.appliedIdentity, match: match)
        discovery.showIntent = intent
        return await navigate(.showDiscovery(intent))
    }

    func canShowDiscovery(_ intent: DiscoveryShowIntent) -> Bool {
        guard signedIn, connection == .live, !Task.isCancelled,
              discovery.credentialEpoch == intent.identity.credentialEpoch,
              discovery.showIntent == intent else { return false }
        return true
    }

    func applyDiscoveryShow(_ intent: DiscoveryShowIntent) async -> Bool {
        guard canShowDiscovery(intent) else { return false }
        let sourceProfile = intent.match.profile.id
        let fullID = intent.match.task_id
        closeDiscovery()
        discovery.showIntent = intent
        let mark = messageMark
        busy = true
        defer { if discovery.credentialEpoch == intent.identity.credentialEpoch { busy = false } }
        do {
            let task = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: sourceProfile, task: fullID)).ok.body.json)
            guard canShowDiscovery(intent) else { return false }
            discovery.showIntent = nil
            clearMessage([.discoveryShow], since: mark)
            editor = nil
            conflict = nil
            activateProfile(sourceProfile)
            searchText = ""
            selectView("all")
            applyTaskFilters(.init(prefix: fullID))
            beginEditing(task)
            return true
        } catch {
            if discovery.credentialEpoch == intent.identity.credentialEpoch { handleAuthorization(error, credentialEpoch: intent.identity.credentialEpoch) }
            guard canShowDiscovery(intent) else { return false }
            discovery.showIntent = nil
            publishMessage(describe(error), kind: .discoveryShow)
            return false
        }
    }
}
