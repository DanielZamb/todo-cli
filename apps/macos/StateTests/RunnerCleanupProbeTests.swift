import Foundation
import Testing

/// Candidate 11 (verify-runner-cleanup.py): a test that hangs on purpose, so the runner's stop can
/// be checked to leave no process of the run behind. Enabled only by RUNNER_HANG_PROBE=1.
@Suite struct RunnerCleanupProbeTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["RUNNER_HANG_PROBE"] == "1"))
    func hangsOnPurpose() async {
        await withCheckedContinuation { (_: CheckedContinuation<Void, Never>) in }
    }
}
