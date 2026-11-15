import Testing

/// Suites that need the main thread to themselves run one after another under this serialized
/// parent: the hosted-window suites lay out a whole RootView on the main actor (a pass can exceed
/// the 100 ms stall threshold), and the stall and activity tests measure the main thread. Run side
/// by side, a window suite's layout was sampled and attributed in the stall test's place.
@Suite(.serialized) enum MainThreadExclusive {}
