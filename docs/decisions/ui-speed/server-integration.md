# Server integration qualification

Branch integ/server merges reviewed SERVER-READS 150a8c33 and reviewed PURGE-RESTORE 8292b067. Merge commit 4d709efa94840a8cb08960d0ad35138cb96dcb9e preserves both histories. Product source is frozen at this merge; subsequent commits contain verification inputs, mappings and records. No parent mapping is used to certify merged source.

## Merge resolutions

- snapshots.ts keeps the strict owner ports and both authorized-read imports, and keeps the entire purge-reference redaction, staging, repair, SQLite error classification and post-restore cleanup implementation. Only the import blocks conflicted.
- OperationStore.constructor keeps the Diagnostics withOwnerRead closure and passes attachmentRoot as Snapshots' fifth argument. OperationStore.cleanupAttachmentsSync keeps the preview early return. No statement was reordered.
- AtomicCAS SKILL.md keeps both branches' mapping histories. The common-base coverage was deliberately provisional for the pre-renewal check, then replaced only after actual-source sensitivity and review. Neither parent's accepted coverage was adopted.

## Interaction review

CLI snapshotUse and HTTP snapshotOwner call requireOwner, wait for it to return, then execute restore. Only list/show call withOwnerRead. Thus no read lease surrounds restore and its !db.inTransaction post-restore erasure remains reachable. The fresh integration probe asserts false at admission return and at restore return. The compiled Snapshot recipe separately exercises both real public helpers and immediate cleanup in eight warm/fresh cases, including custom roots.

The integration probe holds a live lease while a forked in-memory store opens its own lease. Each genuine authority works on its originating database. Both cross-origin attempts return StoreError before any query, and ending the preview does not end the live lease. The preview matrix separately checks all files and logical rows.

Purge's schema-reference scan/delete runs within the existing write path. It uses schema foreign keys and bound Task ids, never an AuthorizedRead or a retained graph authority. The mapped transaction/validation/append/rejection bodies equal both parents. The lifetime suite tests every authority port after Purge, restore and the other scope transitions.

The new checked-read-integration.ts reusable probe lives in verify-snapshots/scripts. Temporary captures are immutable Git archives, not extra checkouts. All data is scratch.

## Mapping review

AtomicCAS Init begins after one valid TaskCreated at Version 1. The combined constructor only supplies closures and attachmentRoot to objects. The Diagnostics closure is not called by construction. On the same scratch seed, construction executes exactly the same statements and bindings on both parents and the merge. The seed hashes match. Constructor traces are constructor-left.json, constructor-right.json and constructor-merged.json in the evidence directory. Begin, Validate, Record, Apply, WriteVersion, Commit, rejection and replay bodies are unchanged. The model excludes authorization, Snapshot restore, Purge privacy and filesystem erasure; their compiled recipes cover those separately. No model, invariant, matcher or bound changes.

Cache review compares 69 complete protected bodies/statements to the earlier authority-qualified source. All are byte-identical, including cache/matcher/runner/admission, both epoch captures, both preparation calls, observer startup and CLI defect classification. The full Snapshots.restore body intentionally changes through the fix branch: it carries durable erasure jobs and calls finishPurgeCleanup after the restore transaction returns. Its generation computation and afterRestore epoch-clear statement remain identical and inside the successful transaction before return. Exact parent-to-merge diffs are preserved in source-diffs/. The cache model abstracts admission and epoch invalidation, not attachment cleanup.

DAG covered algorithm/write/replay functions remain equal to SERVER-READS; store constructor is covered only by AtomicCAS Init and its combined wiring review above. Task search covered readTasks/list and all client publication bodies remain equal to SERVER-READS. The CLI flag registration changes reject ignored options before opening the store; they do not alter graph/model steps. No model change is required. Public conformance is rerun against the merged registration.

The O3 record correction hashes the real Authentication class bodies, not the Ports declarations: startSeries d552c9a1e380f55389205f33092805a1d01c58b0d663093f896c18d005ecac50 and append 2e9bb29d9d17173d82e371654e7783328a36810ecde34d749f93667556931e88. Both equal the older pinned product. DAG coverage now states that three whole files changed and 13 were identical at that historical renewal.

The table hashes each extracted declaration separately. Composite mapping labels use the explicitly named whole-file comparison when no single declaration represents them. No class method is selected from a Ports declaration. Complete hashes, selections and both parent values are retained in mapped-functions.json.

| Mapping | Covered function | Hash left / merged | Result |
| --- | --- | --- | --- |
| verify-occ-atomicity | OperationStore.constructor | aa941cfc5e89afaa9168dc54f468c256ca2323b60dd6445954a5c223ea8983dc / d33b40bf1ca1c37e4fda6d74eab51faccec1bebce46951da9c6ae9769f807066 | combined constructor, exact diff reviewed |
| verify-occ-atomicity | OperationStore.transaction | 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 / 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.record | 473cc76f951e334a5470df35c43dfa33943a52c20661b0bf6280bc7bc71af41d / 473cc76f951e334a5470df35c43dfa33943a52c20661b0bf6280bc7bc71af41d | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.recordRejection | 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 / 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.validate | fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de / fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.appendSync | bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c / bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.append | a4b6043a2039071f0c48ab6ba48e272bce7c75df9d08e52c841da7653d617b5c / a4b6043a2039071f0c48ab6ba48e272bce7c75df9d08e52c841da7653d617b5c | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.historySync | 8c5c46825255a81ecb66ce72249911e96bfee43cb629579ccc0636911f296891 / 8c5c46825255a81ecb66ce72249911e96bfee43cb629579ccc0636911f296891 | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.takeSnapshot | 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 / 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 | identical to SERVER-READS |
| verify-occ-atomicity | OperationStore.rebuild | c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 / c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 | identical to SERVER-READS |
| verify-occ-atomicity | changes | cb7c6e773b5c212c7267bfbceb5d0fd61f31df20471273a292ca949330b3b644 / cb7c6e773b5c212c7267bfbceb5d0fd61f31df20471273a292ca949330b3b644 | identical to SERVER-READS |
| verify-occ-atomicity | applyEvent | 767b3d69c09f810e2adf39657a6cf110b8a7846552cf87e4ec8b336b91a39f70 / 767b3d69c09f810e2adf39657a6cf110b8a7846552cf87e4ec8b336b91a39f70 | identical to SERVER-READS |
| verify-occ-atomicity | applyChanges | fea3923c5836e77278ed4d1f7933f721b3ffc6e7d81a35506f2d8f48d77b3508 / fea3923c5836e77278ed4d1f7933f721b3ffc6e7d81a35506f2d8f48d77b3508 | identical to SERVER-READS |
| verify-occ-atomicity | putTask | 83fb3c6a5ed469b1d4fabb16c7c771d3c1cf334af008ae3e00868ff32acd86ea / 83fb3c6a5ed469b1d4fabb16c7c771d3c1cf334af008ae3e00868ff32acd86ea | identical to SERVER-READS |
| verify-occ-atomicity | readTasks | 0fe47967b4b2a29925aa6a92cfc637963070d4d2cae3e14c9120e9966e0ef593 / 0fe47967b4b2a29925aa6a92cfc637963070d4d2cae3e14c9120e9966e0ef593 | identical to SERVER-READS |
| verify-occ-atomicity | Snapshot | 99a8fcf42811b76ee70b0c400e2ccf611a59b250e698837dd071a0dda464266f / 99a8fcf42811b76ee70b0c400e2ccf611a59b250e698837dd071a0dda464266f | identical to SERVER-READS |
| verify-occ-atomicity | snapshot | 62300888bd669fe098da68ee8d31c2ede58b789ffb33d319f88b9e5006983c9a / 62300888bd669fe098da68ee8d31c2ede58b789ffb33d319f88b9e5006983c9a | identical to SERVER-READS |
| verify-occ-atomicity | TaskCreated | 13ce1caa2406f2abb6088149526df91d9f7117a4a73f796c3ac6f62bf107612e / 13ce1caa2406f2abb6088149526df91d9f7117a4a73f796c3ac6f62bf107612e | identical to SERVER-READS |
| verify-occ-atomicity | TaskEdited | c43ed8de467773fe33e62e143b323bf16270e9cc49082f2f26dad857a5156b2b / c43ed8de467773fe33e62e143b323bf16270e9cc49082f2f26dad857a5156b2b | identical to SERVER-READS |
| verify-occ-atomicity | AttachmentAdded | 0cff2dc51068dec9e4ef82091fdd4114c88b51996465d1fce234fa2618d34c15 / 0cff2dc51068dec9e4ef82091fdd4114c88b51996465d1fce234fa2618d34c15 | identical to SERVER-READS |
| verify-occ-atomicity | TaskDeleted | 5f7b89d88a431449568d729e0b0d5ed37ad424562f1256bbfafe2b8642a8a3a5 / 5f7b89d88a431449568d729e0b0d5ed37ad424562f1256bbfafe2b8642a8a3a5 | identical to SERVER-READS |
| verify-occ-atomicity | TaskAttemptRejected | 5083d41ab78a6213f2285da1562b32cff80f48993633f6a6ee2cfa77db53d76d / 5083d41ab78a6213f2285da1562b32cff80f48993633f6a6ee2cfa77db53d76d | identical to SERVER-READS |
| verify-occ-atomicity | Event | 3f42d84bfe34f172faa6f3a774fce54eee1803d5564d11d3fcdf4493b1f77d61 / 3f42d84bfe34f172faa6f3a774fce54eee1803d5564d11d3fcdf4493b1f77d61 | identical to SERVER-READS |
| verify-occ-atomicity | OpLogEntry | b5567e377713dfc2442cd474d12e84e05d3902eeb9837ab1feb5a406c6817381 / b5567e377713dfc2442cd474d12e84e05d3902eeb9837ab1feb5a406c6817381 | identical to SERVER-READS |
| verify-occ-atomicity | Task | 22046f73c7b5504e77edcd79433889cfc29667757e5b037f141f1a1efd68ab0a / 22046f73c7b5504e77edcd79433889cfc29667757e5b037f141f1a1efd68ab0a | identical to SERVER-READS |
| verify-occ-atomicity | Profile | 96592baba7d5828db0b253b9a5a414e4bf406c6a4de8eed8ed718a4f775de8bf / 96592baba7d5828db0b253b9a5a414e4bf406c6a4de8eed8ed718a4f775de8bf | identical to SERVER-READS |
| verify-occ-atomicity | ActorId | 397b57b913ed274fca57e4f61223d19bc96edb41db05d94e2c1dbe0d7f36e1ba / 397b57b913ed274fca57e4f61223d19bc96edb41db05d94e2c1dbe0d7f36e1ba | identical to SERVER-READS |
| verify-occ-atomicity | ProfileId | b0f0bbadb895708245039c7a4054c0433a99a8aad2e5c6c2250c9239d8890b66 / b0f0bbadb895708245039c7a4054c0433a99a8aad2e5c6c2250c9239d8890b66 | identical to SERVER-READS |
| verify-occ-atomicity | TaskId | 411a823532ab16ba9cdff989afcbcc71b9a1a07605ac215558e899fa9a8954d6 / 411a823532ab16ba9cdff989afcbcc71b9a1a07605ac215558e899fa9a8954d6 | identical to SERVER-READS |
| verify-occ-atomicity | Version | 233f3450afc925920d80c62ed87163090228894fdb12221569e746c3bb9e1da4 / 233f3450afc925920d80c62ed87163090228894fdb12221569e746c3bb9e1da4 | identical to SERVER-READS |
| verify-occ-atomicity | Attachment | a1881b1cff8bf4724e58b4c58696ff7718dd83db075967ac7766f35bec695926 / a1881b1cff8bf4724e58b4c58696ff7718dd83db075967ac7766f35bec695926 | identical to SERVER-READS |
| verify-occ-atomicity | validAttachmentLocation | ef7ad80e55d4624624d5e27138fda2b20a8e8c6bf8ff65ca82cad5bf4b9f43cc / ef7ad80e55d4624624d5e27138fda2b20a8e8c6bf8ff65ca82cad5bf4b9f43cc | identical to SERVER-READS |
| verify-occ-atomicity | validateDependencies | d851235384b6fe482ac24e7e912dd8d069c34b6a09f8747c8e9f6bb564e73010 / d851235384b6fe482ac24e7e912dd8d069c34b6a09f8747c8e9f6bb564e73010 | identical to SERVER-READS |
| verify-occ-atomicity | applyDependencyVersions | 500de09dbbf38d1feafb913ce90639dc40b11ee20a33b13b6cf66984ce80fe16 / 500de09dbbf38d1feafb913ce90639dc40b11ee20a33b13b6cf66984ce80fe16 | identical to SERVER-READS |
| verify-occ-atomicity | incidentRemoval | 3f3fee30f1ebf1c1281f451bb44a85deb714209dcf492ba7874a3422a875cfce / 3f3fee30f1ebf1c1281f451bb44a85deb714209dcf492ba7874a3422a875cfce | identical to SERVER-READS |
| verify-occ-atomicity | upstream | 9f77fb42c97b117429f802d69a27af210951abe17096e68ee078d1e45073db26 / 9f77fb42c97b117429f802d69a27af210951abe17096e68ee078d1e45073db26 | identical to SERVER-READS |
| verify-occ-atomicity | hasDependents | a616e808eef9f67b648a55a7f3fd25fc1fb9eee6ea8b68cfd69b37591a5723d4 / a616e808eef9f67b648a55a7f3fd25fc1fb9eee6ea8b68cfd69b37591a5723d4 | identical to SERVER-READS |
| verify-occ-atomicity | checkDependencyAddition | 80afe3bbce92bf7114dd0edc155a4fe3b1b8b581895ca48acdbd589b606e1f3f / 80afe3bbce92bf7114dd0edc155a4fe3b1b8b581895ca48acdbd589b606e1f3f | identical to SERVER-READS |
| verify-occ-atomicity | checkDependencyStatuses | 0d907a5e6a7b4ed6f77909e298708b3c7baa7b4d640f3fd48da72ccef0a9794f / 0d907a5e6a7b4ed6f77909e298708b3c7baa7b4d640f3fd48da72ccef0a9794f | identical to SERVER-READS |
| verify-occ-atomicity | dependencyCycle | 0e461d1c67564b7c0cc46fdb8f866b2b6d6bc351abd21028c757b3c79f3642cf / 0e461d1c67564b7c0cc46fdb8f866b2b6d6bc351abd21028c757b3c79f3642cf | identical to SERVER-READS |
| verify-occ-atomicity | Edge | e3e0cd41ee7e0f19954b23405ddea2811a1136ef0781ce8c7871c6c5219fe480 / e3e0cd41ee7e0f19954b23405ddea2811a1136ef0781ce8c7871c6c5219fe480 | identical to SERVER-READS |
| verify-occ-atomicity | VersionChange | f692cb5fa0d7248cb3b107c3fd1276b01d7dcadc0d0ae2b85f0dd451656fb17d / f692cb5fa0d7248cb3b107c3fd1276b01d7dcadc0d0ae2b85f0dd451656fb17d | identical to SERVER-READS |
| verify-occ-atomicity | DependencyChanges | ed452b1a4b8eed2dedcd7dfbd8364dc46775a54ab48e37bcd6d3bc98e6e9fb72 / ed452b1a4b8eed2dedcd7dfbd8364dc46775a54ab48e37bcd6d3bc98e6e9fb72 | identical to SERVER-READS |
| verify-occ-atomicity | DependencyError | c0b6ca4520a18a7b9fe4c0d120bc887abc4808666ea5724f6e9260cb6e5924cc / c0b6ca4520a18a7b9fe4c0d120bc887abc4808666ea5724f6e9260cb6e5924cc | identical to SERVER-READS |
| verify-occ-atomicity | RejectionDetails | d6c4403d67eb57c8d8884d98a094db9fce54083bc2cab8c0ea872b1fddac8e9d / d6c4403d67eb57c8d8884d98a094db9fce54083bc2cab8c0ea872b1fddac8e9d | identical to SERVER-READS |
| verify-dag-formal | indexGraph | 6b38c6ebe3cc149149243e3e76461fb16e8e56bb2279c2b4252c21c62f199858 / 6b38c6ebe3cc149149243e3e76461fb16e8e56bb2279c2b4252c21c62f199858 | identical to SERVER-READS |
| verify-dag-formal | dependencyState | c2cd6a57911eb283ec1581ac5ec7e42c4b51aeabb83518f296f578121a084e5f / c2cd6a57911eb283ec1581ac5ec7e42c4b51aeabb83518f296f578121a084e5f | identical to SERVER-READS |
| verify-dag-formal | reachable | 5746b2520980a2328938d927e2995a755e13573a16190bd38848ae45df5924be / 5746b2520980a2328938d927e2995a755e13573a16190bd38848ae45df5924be | identical to SERVER-READS |
| verify-dag-formal | compareGraphTasks | ffa6b905b258a8c3995a47bc0bc1fa08da5a3b4e927c06eb5060776bca8db8b8 / ffa6b905b258a8c3995a47bc0bc1fa08da5a3b4e927c06eb5060776bca8db8b8 | identical to SERVER-READS |
| verify-dag-formal | TaskHeap | 1a940ed007f2dcf864203daba885df6b29b5eb8036fbec454d0d3e7c052d3fbd / 1a940ed007f2dcf864203daba885df6b29b5eb8036fbec454d0d3e7c052d3fbd | identical to SERVER-READS |
| verify-dag-formal | topologicalOrder | deb64af8784b7258a0d43a033476a4261bacc901720aa10ece2d3c2aa59446a8 / deb64af8784b7258a0d43a033476a4261bacc901720aa10ece2d3c2aa59446a8 | identical to SERVER-READS |
| verify-dag-formal | graphEnergy | 0f4841ebcd81f23fe7ac5e519c91b0c429936bb1292a50d8d6aeadaff410392a / 0f4841ebcd81f23fe7ac5e519c91b0c429936bb1292a50d8d6aeadaff410392a | identical to SERVER-READS |
| verify-dag-formal | contains | 163f46423f38c733c4cf0a250231c0ee64a441177a2636e32c47a88e15656a68 / 163f46423f38c733c4cf0a250231c0ee64a441177a2636e32c47a88e15656a68 | identical to SERVER-READS, composite whole file |
| verify-dag-formal | lightestNext | 163f46423f38c733c4cf0a250231c0ee64a441177a2636e32c47a88e15656a68 / 163f46423f38c733c4cf0a250231c0ee64a441177a2636e32c47a88e15656a68 | identical to SERVER-READS, composite whole file |
| verify-dag-formal | graphShape | 3acfe7a3379383440494cddfa1b6a3c3186f8e62de0e27375104c4e9ca4534f4 / 3acfe7a3379383440494cddfa1b6a3c3186f8e62de0e27375104c4e9ca4534f4 | identical to SERVER-READS |
| verify-dag-formal | queryGraph component/shape fields | 9529fa8fdf937390cca56286be5b514b8ded8ed888fae7cd46add6efa858f4e6 / 9529fa8fdf937390cca56286be5b514b8ded8ed888fae7cd46add6efa858f4e6 | identical to SERVER-READS |
| verify-dag-formal | dependencyCycle | 0e461d1c67564b7c0cc46fdb8f866b2b6d6bc351abd21028c757b3c79f3642cf / 0e461d1c67564b7c0cc46fdb8f866b2b6d6bc351abd21028c757b3c79f3642cf | identical to SERVER-READS |
| verify-dag-formal | shortestUpstreamPath | c267c487fc7aab14ea8653393870ae79aff19a59e6d5872a1e0d51ff5fb95f82 / c267c487fc7aab14ea8653393870ae79aff19a59e6d5872a1e0d51ff5fb95f82 | identical to SERVER-READS |
| verify-dag-formal | checkDependencyAddition | 80afe3bbce92bf7114dd0edc155a4fe3b1b8b581895ca48acdbd589b606e1f3f / 80afe3bbce92bf7114dd0edc155a4fe3b1b8b581895ca48acdbd589b606e1f3f | identical to SERVER-READS |
| verify-dag-formal | checkDependencyStatuses | 0d907a5e6a7b4ed6f77909e298708b3c7baa7b4d640f3fd48da72ccef0a9794f / 0d907a5e6a7b4ed6f77909e298708b3c7baa7b4d640f3fd48da72ccef0a9794f | identical to SERVER-READS |
| verify-dag-formal | dependencyAdvice | 545ad01d3229df14ff88c38d49db91853ec95ae64dda1e502f1f441680463d65 / 545ad01d3229df14ff88c38d49db91853ec95ae64dda1e502f1f441680463d65 | identical to SERVER-READS |
| verify-dag-formal | unresolved | 16fcf7a6255280a273c643ab5c0fafa313fbb5905b07f78bf130afec54c093b7 / 16fcf7a6255280a273c643ab5c0fafa313fbb5905b07f78bf130afec54c093b7 | identical to SERVER-READS |
| verify-dag-formal | Edge | e3e0cd41ee7e0f19954b23405ddea2811a1136ef0781ce8c7871c6c5219fe480 / e3e0cd41ee7e0f19954b23405ddea2811a1136ef0781ce8c7871c6c5219fe480 | identical to SERVER-READS |
| verify-dag-formal | VersionChange | f692cb5fa0d7248cb3b107c3fd1276b01d7dcadc0d0ae2b85f0dd451656fb17d / f692cb5fa0d7248cb3b107c3fd1276b01d7dcadc0d0ae2b85f0dd451656fb17d | identical to SERVER-READS |
| verify-dag-formal | DependencyChanges | ed452b1a4b8eed2dedcd7dfbd8364dc46775a54ab48e37bcd6d3bc98e6e9fb72 / ed452b1a4b8eed2dedcd7dfbd8364dc46775a54ab48e37bcd6d3bc98e6e9fb72 | identical to SERVER-READS |
| verify-dag-formal | DependencyError | c0b6ca4520a18a7b9fe4c0d120bc887abc4808666ea5724f6e9260cb6e5924cc / c0b6ca4520a18a7b9fe4c0d120bc887abc4808666ea5724f6e9260cb6e5924cc | identical to SERVER-READS |
| verify-dag-formal | Task | 22046f73c7b5504e77edcd79433889cfc29667757e5b037f141f1a1efd68ab0a / 22046f73c7b5504e77edcd79433889cfc29667757e5b037f141f1a1efd68ab0a | identical to SERVER-READS |
| verify-dag-formal | Event | 3f42d84bfe34f172faa6f3a774fce54eee1803d5564d11d3fcdf4493b1f77d61 / 3f42d84bfe34f172faa6f3a774fce54eee1803d5564d11d3fcdf4493b1f77d61 | identical to SERVER-READS |
| verify-dag-formal | OpLogEntry | b5567e377713dfc2442cd474d12e84e05d3902eeb9837ab1feb5a406c6817381 / b5567e377713dfc2442cd474d12e84e05d3902eeb9837ab1feb5a406c6817381 | identical to SERVER-READS |
| verify-dag-formal | DependencyAdded | 3c20d5f752973ea1669916cd08a05efb4b9e3799480491d31c2f905d6f7e797d / 3c20d5f752973ea1669916cd08a05efb4b9e3799480491d31c2f905d6f7e797d | identical to SERVER-READS |
| verify-dag-formal | DependencyRemoved | 2b072887ab68857d7e4715c26511d2e0cc453b54e8d2386432e7ad109bfd35b0 / 2b072887ab68857d7e4715c26511d2e0cc453b54e8d2386432e7ad109bfd35b0 | identical to SERVER-READS |
| verify-dag-formal | TaskCreated v1/v2 | 13ce1caa2406f2abb6088149526df91d9f7117a4a73f796c3ac6f62bf107612e / 13ce1caa2406f2abb6088149526df91d9f7117a4a73f796c3ac6f62bf107612e | identical to SERVER-READS |
| verify-dag-formal | TaskDeleted v1/v2 | 5f7b89d88a431449568d729e0b0d5ed37ad424562f1256bbfafe2b8642a8a3a5 / 5f7b89d88a431449568d729e0b0d5ed37ad424562f1256bbfafe2b8642a8a3a5 | identical to SERVER-READS |
| verify-dag-formal | TaskMovedOut v1/v2 | f0075a474b8642ad9b8144a50e2ba689fca6f83d25dc5cf57b271a992370be20 / f0075a474b8642ad9b8144a50e2ba689fca6f83d25dc5cf57b271a992370be20 | identical to SERVER-READS |
| verify-dag-formal | TaskReverted v1/v2 | dc15cf22e1b790c950879e1dd2e59d6b6654684ae48599e63218d424cd6a5167 / dc15cf22e1b790c950879e1dd2e59d6b6654684ae48599e63218d424cd6a5167 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.transaction | 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 / 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.validate | fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de / fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de | identical to SERVER-READS |
| verify-dag-formal | OperationStore.appendSync | bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c / bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c | identical to SERVER-READS |
| verify-dag-formal | OperationStore.recordRejection | 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 / 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.graph | ff4207baa941f49150b4574202985c5e53a6a611d03ba8ce08961039930b9cde / ff4207baa941f49150b4574202985c5e53a6a611d03ba8ce08961039930b9cde | identical to SERVER-READS |
| verify-dag-formal | OperationStore.dependencies | 3002f304ea7c91082dd88df5859867a97450004d6a080370e088a8e4fbf8860e / 3002f304ea7c91082dd88df5859867a97450004d6a080370e088a8e4fbf8860e | identical to SERVER-READS |
| verify-dag-formal | OperationStore.rebuild | c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 / c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.takeSnapshot | 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 / 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.resolveRevertSync | 60e7a2d5ed5f8e57bee1d4f5efcb640739e46d06d93d1c9021ffcf657c7759ac / 60e7a2d5ed5f8e57bee1d4f5efcb640739e46d06d93d1c9021ffcf657c7759ac | identical to SERVER-READS |
| verify-dag-formal | OperationStore.move | 036d8c4c614d7f557655fe5da362039f500da7b8263432cb1413f9ffb68b0a65 / 036d8c4c614d7f557655fe5da362039f500da7b8263432cb1413f9ffb68b0a65 | identical to SERVER-READS |
| verify-dag-formal | OperationStore.startSeriesSync | e0c2d479ac7c3b4f0031281bb308d95e4e8323d7044ed58c9f4d2925e7c0ed88 / e0c2d479ac7c3b4f0031281bb308d95e4e8323d7044ed58c9f4d2925e7c0ed88 | identical to SERVER-READS |
| verify-dag-formal | createProjection | c8fa1f8239f2d5e0ff5ac49be189c22bb1e1cac24745f9491e15c2427c9ec0f7 / c8fa1f8239f2d5e0ff5ac49be189c22bb1e1cac24745f9491e15c2427c9ec0f7 | identical to SERVER-READS |
| verify-dag-formal | changes | cb7c6e773b5c212c7267bfbceb5d0fd61f31df20471273a292ca949330b3b644 / cb7c6e773b5c212c7267bfbceb5d0fd61f31df20471273a292ca949330b3b644 | identical to SERVER-READS |
| verify-dag-formal | applyChanges | fea3923c5836e77278ed4d1f7933f721b3ffc6e7d81a35506f2d8f48d77b3508 / fea3923c5836e77278ed4d1f7933f721b3ffc6e7d81a35506f2d8f48d77b3508 | identical to SERVER-READS |
| verify-dag-formal | applyEvent | 767b3d69c09f810e2adf39657a6cf110b8a7846552cf87e4ec8b336b91a39f70 / 767b3d69c09f810e2adf39657a6cf110b8a7846552cf87e4ec8b336b91a39f70 | identical to SERVER-READS |
| verify-dag-formal | Snapshot | 99a8fcf42811b76ee70b0c400e2ccf611a59b250e698837dd071a0dda464266f / 99a8fcf42811b76ee70b0c400e2ccf611a59b250e698837dd071a0dda464266f | identical to SERVER-READS |
| verify-dag-formal | snapshot | 62300888bd669fe098da68ee8d31c2ede58b789ffb33d319f88b9e5006983c9a / 62300888bd669fe098da68ee8d31c2ede58b789ffb33d319f88b9e5006983c9a | identical to SERVER-READS |
| verify-dag-formal | readEdges | 26a5d086f0e1e3679078520a2b78474999c15ce5d3dba1b310309196a52a4c92 / 26a5d086f0e1e3679078520a2b78474999c15ce5d3dba1b310309196a52a4c92 | identical to SERVER-READS |
| verify-dag-formal | incidentRemoval | 3f3fee30f1ebf1c1281f451bb44a85deb714209dcf492ba7874a3422a875cfce / 3f3fee30f1ebf1c1281f451bb44a85deb714209dcf492ba7874a3422a875cfce | identical to SERVER-READS |
| verify-dag-formal | applyDependencyVersions | 500de09dbbf38d1feafb913ce90639dc40b11ee20a33b13b6cf66984ce80fe16 / 500de09dbbf38d1feafb913ce90639dc40b11ee20a33b13b6cf66984ce80fe16 | identical to SERVER-READS |
| verify-dag-formal | putEdge | d0fa852703217e0bdd8d1acb81f1704dd59c081debf638cbfb9dc7b45be1aef9 / d0fa852703217e0bdd8d1acb81f1704dd59c081debf638cbfb9dc7b45be1aef9 | identical to SERVER-READS |
| verify-dag-formal | validateDependencies | d851235384b6fe482ac24e7e912dd8d069c34b6a09f8747c8e9f6bb564e73010 / d851235384b6fe482ac24e7e912dd8d069c34b6a09f8747c8e9f6bb564e73010 | identical to SERVER-READS |
| verify-dag-formal | dependencySchemaSql | 4fa85dd88e12f52a646b4a0311e9d6fed37db77827e9e9738e25901137381f57 / 4fa85dd88e12f52a646b4a0311e9d6fed37db77827e9e9738e25901137381f57 | identical to SERVER-READS |
| verify-dag-formal | dependencyMigrationSql | 6874cbd813fc707e2650edb074e9eedce06df318ebafdac788add2a50860f213 / 6874cbd813fc707e2650edb074e9eedce06df318ebafdac788add2a50860f213 | identical to SERVER-READS |
| verify-dag-formal | migrate | 2fb6468cf5c9a52b0ba40ddc1120becbf28adb9409ccc80d05ec2eb526a69c1f / 2fb6468cf5c9a52b0ba40ddc1120becbf28adb9409ccc80d05ec2eb526a69c1f | identical to SERVER-READS |
| verify-dag-formal | redactTaskHistory | c1db771547ab864e36aeb1a3d192274da281feb10930bda6c3c0d9cba8b7bb20 / 82b078f9f4bc0c92d12c5683a9df21fd621ba3d5948e98bf4d62f9db4f4a6883 | identical to PURGE-RESTORE |
| verify-dag-formal | mentions | 78dc11ee2f38b6626fc2be1d31b446464495853a82bec8ed6fdd1c16be5c53d8 / 78dc11ee2f38b6626fc2be1d31b446464495853a82bec8ed6fdd1c16be5c53d8 | identical to SERVER-READS |
| verify-dag-formal | Authentication.startSeries | d552c9a1e380f55389205f33092805a1d01c58b0d663093f896c18d005ecac50 / d552c9a1e380f55389205f33092805a1d01c58b0d663093f896c18d005ecac50 | identical to SERVER-READS |
| verify-dag-formal | Authentication.append | 2e9bb29d9d17173d82e371654e7783328a36810ecde34d749f93667556931e88 / 2e9bb29d9d17173d82e371654e7783328a36810ecde34d749f93667556931e88 | identical to SERVER-READS |
| verify-task-search-formal | requestedIdentity | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | refresh | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | changeSearch | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | activateProfile | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | activateView | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | clearFilters | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | changed/connection notice handlers | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | catalogRef | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | catalogOwedRef | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | invalidate | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | searchDefinitions Profile-keyed metadata | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | endAuthentication | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | changed/connection/reload notice handlers | 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 / 8dbb97b37d928f6e0544bfe806f958c4a0736cdb321af1f7c834f62441dd77c1 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | SearchIdentity | 9c889559e74dc0f9fa2c9c2eb51b29745e62186876a2c6d75b790e83baf6b028 / 9c889559e74dc0f9fa2c9c2eb51b29745e62186876a2c6d75b790e83baf6b028 | identical to SERVER-READS |
| verify-task-search-formal | AppliedSearch | f32e74370f3a580d5925a42265de212fc78a5524e3db2f3293f396b91093eeb4 / f32e74370f3a580d5925a42265de212fc78a5524e3db2f3293f396b91093eeb4 | identical to SERVER-READS |
| verify-task-search-formal | identityKey | d60e85c4fc0d7e5a3fa703ae99fd2f034cd65439007d42fb014e561631ea955f / d60e85c4fc0d7e5a3fa703ae99fd2f034cd65439007d42fb014e561631ea955f | identical to SERVER-READS |
| verify-task-search-formal | searchGroups | 16d7631964d6e336446581854e4beee1465d5da50ba3ff7042c86f8ca040a2ae / 16d7631964d6e336446581854e4beee1465d5da50ba3ff7042c86f8ca040a2ae | identical to SERVER-READS |
| verify-task-search-formal | taskSearchQuery | 7cdb911c3e9c8fcf0fd0aa48772488b454e26652500a936434ecc32e8078eb39 / 7cdb911c3e9c8fcf0fd0aa48772488b454e26652500a936434ecc32e8078eb39 | identical to SERVER-READS |
| verify-task-search-formal | taskRequest list branch | 35e31f0a344103fd5402659244f68cbf1f74bd659fdf8081bf3eebefdf55d5e6 / 35e31f0a344103fd5402659244f68cbf1f74bd659fdf8081bf3eebefdf55d5e6 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | taskRequest search branch | 35e31f0a344103fd5402659244f68cbf1f74bd659fdf8081bf3eebefdf55d5e6 / 35e31f0a344103fd5402659244f68cbf1f74bd659fdf8081bf3eebefdf55d5e6 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | Request search decoder | 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 / 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | Reply tasks/search TaskRead decoders | 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 / 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | Reply tasks TaskRead decoder | 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 / 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | Reply error code decoder | 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 / 70876d227da2a0f638bad7f1a8572582a22153d8d3c10b2ea7c300b6ed4c8aa8 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | requestedIdentity | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | refresh(generation:) | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | canPublishSearch | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | invalidateSearch | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | scheduleSearch | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | retrySearch | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | activateProfile | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | selectView | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | followChanges | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | applyTaskFilters | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | catalogReady | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | catalogStale | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | readSearchRows | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | readSearchPlanning | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | readSearchCatalog | e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 / e32b6f0ca0d53408aeb7624eabc52f55fc38f203c15fb7c18c6c0a2b82c33203 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchIdentity | 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 / 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchSnapshot | 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 / 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchRefreshOutcome | 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 / 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchPresentation | 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 / 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchFailure | 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 / 2b98d8fb63ae9be6afc2983e63a0c60bf2ac640b1dbceeef842dc1b6ef8a2445 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | visibleTasks | 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 / 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | taskGroups | 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 / 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | row | 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 / 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | taskContent | 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 / 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | searchField | 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 / 1abf621b6a576f217ea92d74353650c956a7bd255ea06f5b61e539066130bc43 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSnapshot | 8502de3358af711ba47c20790d32214caaacd3ed6c6ad1655367a93149feb9e6 / 8502de3358af711ba47c20790d32214caaacd3ed6c6ad1655367a93149feb9e6 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskSearchMatch | 8502de3358af711ba47c20790d32214caaacd3ed6c6ad1655367a93149feb9e6 / 8502de3358af711ba47c20790d32214caaacd3ed6c6ad1655367a93149feb9e6 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | normalizeTaskSearch | 86ecb64784debec87ba4490f394d7a3575bc90c10acad6fe7fd99b8fa1ac6595 / 86ecb64784debec87ba4490f394d7a3575bc90c10acad6fe7fd99b8fa1ac6595 | identical to SERVER-READS |
| verify-task-search-formal | parseTaskSearch | 8a03ad9eef3172422a8cb2f299a6a47d1a7cd0536c609a12586258666726648e / 8a03ad9eef3172422a8cb2f299a6a47d1a7cd0536c609a12586258666726648e | identical to SERVER-READS |
| verify-task-search-formal | matchTaskSearch | c6f4999ad5e670780f294aa21f8d670f5ee16ef9c589233b6f46aee5d940e2fa / c6f4999ad5e670780f294aa21f8d670f5ee16ef9c589233b6f46aee5d940e2fa | identical to SERVER-READS |
| verify-task-search-formal | PreparedField | 65b098271d84b8a356c0d0af61085089ad5ea34d7a33115e96150fc6ed04e5d3 / 65b098271d84b8a356c0d0af61085089ad5ea34d7a33115e96150fc6ed04e5d3 | identical to SERVER-READS |
| verify-task-search-formal | taskSearchWorkLimits | 31231d8eb9829a309b197926d812c11f6ca8ac905af5a6708e39a47e0bcb3d46 / 31231d8eb9829a309b197926d812c11f6ca8ac905af5a6708e39a47e0bcb3d46 | identical to SERVER-READS |
| verify-task-search-formal | TaskSearchWork | c8f19c356a228deda889342dc606ac109360f1ceb82ecca90f625f4f69d9d9ec / c8f19c356a228deda889342dc606ac109360f1ceb82ecca90f625f4f69d9d9ec | identical to SERVER-READS |
| verify-task-search-formal | fieldWords | 3832da1041c7c75e2cdfb67e4c6f4b689bd28fa8738849bfb1e564c5574c19cc / 3832da1041c7c75e2cdfb67e4c6f4b689bd28fa8738849bfb1e564c5574c19cc | identical to SERVER-READS |
| verify-task-search-formal | prefixMatcher | 071804a76e0ff2ebcbb1203ca44b7ac9c2c6a9c6c996a7e53349feb98b220b73 / 071804a76e0ff2ebcbb1203ca44b7ac9c2c6a9c6c996a7e53349feb98b220b73 | identical to SERVER-READS |
| verify-task-search-formal | clauseMatches | e639d052082c0c212b6f0ddeea24b9b1946a70f5ee8a1cec512dbd8e51f60d97 / e639d052082c0c212b6f0ddeea24b9b1946a70f5ee8a1cec512dbd8e51f60d97 | identical to SERVER-READS |
| verify-task-search-formal | matchTaskSearchSteps | 21fb7ad76c3d9781c95bc57e360dab239bb7563b9beac5ace5699a7e24f0c6ca / 21fb7ad76c3d9781c95bc57e360dab239bb7563b9beac5ace5699a7e24f0c6ca | identical to SERVER-READS |
| verify-task-search-formal | taskSearchCaseFold | d72587103ad6b9242c2cd5d6f2f8fc11b43f34da300e459a505e216f528d5957 / d72587103ad6b9242c2cd5d6f2f8fc11b43f34da300e459a505e216f528d5957 | identical to SERVER-READS |
| verify-task-search-formal | TaskFilters | cb88aa7b6d3a40ad1ca948bd3040e692da0359a35d47b615064ddff6dbe808b3 / cb88aa7b6d3a40ad1ca948bd3040e692da0359a35d47b615064ddff6dbe808b3 | identical to SERVER-READS |
| verify-task-search-formal | filterTaskRecords | 5690f855869639971b17923c85d5afb064837aeae3c6a54acdc7c579fb0c4a69 / 5690f855869639971b17923c85d5afb064837aeae3c6a54acdc7c579fb0c4a69 | identical to SERVER-READS |
| verify-task-search-formal | filterTaskRecordSteps | 4daa1e1ce0a646857adc1b9f9fd62d556be1ef54cfe178331ca141631f61bf9b / 4daa1e1ce0a646857adc1b9f9fd62d556be1ef54cfe178331ca141631f61bf9b | identical to SERVER-READS |
| verify-task-search-formal | runTaskRecordSteps | 2c8d3b7ce26660529046c5ab238372c097fb7eca72185125da0c1ce1d4db7b61 / 2c8d3b7ce26660529046c5ab238372c097fb7eca72185125da0c1ce1d4db7b61 | identical to SERVER-READS |
| verify-task-search-formal | filterTaskRecordsEffect | 6b379c4ee233c10d714ecac1b003fb567964d5dac318249f9e450a6fff4e5832 / 6b379c4ee233c10d714ecac1b003fb567964d5dac318249f9e450a6fff4e5832 | identical to SERVER-READS |
| verify-task-search-formal | TaskRead | 6c9a582f64a83b5f73b163743c37b0f5b63abcb671d166b2dfb2038eb3258924 / 6c9a582f64a83b5f73b163743c37b0f5b63abcb671d166b2dfb2038eb3258924 | identical to SERVER-READS |
| verify-task-search-formal | inputLimits.searchText | cd83a481987cf5e0b2edfd657a9ea5a599e8726e55d9b6fa11edcbca7fd17f17 / cd83a481987cf5e0b2edfd657a9ea5a599e8726e55d9b6fa11edcbca7fd17f17 | identical to SERVER-READS, composite whole file |
| verify-task-search-formal | TaskViewSchema | bb14221f77e435c7873bbd05321196d4ddff438aefb6c2dd403ee5ea2ca67ef5 / bb14221f77e435c7873bbd05321196d4ddff438aefb6c2dd403ee5ea2ca67ef5 | identical to SERVER-READS |
| verify-task-search-formal | taskView | 368e4bb3f5ad24469cfec6335ba6fcbbd121d1d4299fac3dbfdb851be10f971d / 368e4bb3f5ad24469cfec6335ba6fcbbd121d1d4299fac3dbfdb851be10f971d | identical to SERVER-READS |
| verify-task-search-formal | readTasks | d9e5ddf146e635e006f4854b45e072b523750b02befbb4be9359381c9baec676 / d9e5ddf146e635e006f4854b45e072b523750b02befbb4be9359381c9baec676 | identical to SERVER-READS |
| verify-task-search-formal | TaskCommands.list | 3c7291e3fe39fd3b230409b06b3f032613074176680fbd71c515f2ed3bf4e9dd / 3c7291e3fe39fd3b230409b06b3f032613074176680fbd71c515f2ed3bf4e9dd | identical to SERVER-READS |
| verify-task-search-formal | appliedSearchContext | 40cd828b8203f8f2456bebe802b566ef62a567b2f02b7d5542ba32f9a678d63d / 40cd828b8203f8f2456bebe802b566ef62a567b2f02b7d5542ba32f9a678d63d | identical to SERVER-READS |
| verify-task-search-formal | SearchErrorMessage | 8bba66f8eca909b305ee93ac71f350242ab979f8bf549fb84a0ae8cf96c1fef5 / 8bba66f8eca909b305ee93ac71f350242ab979f8bf549fb84a0ae8cf96c1fef5 | identical to SERVER-READS |
| verify-task-search-formal | SearchHighlight | cc84bcec2176d559166f1c0bc7bd5ade810d01061220c4e121432fdc122faeaf / cc84bcec2176d559166f1c0bc7bd5ade810d01061220c4e121432fdc122faeaf | identical to SERVER-READS |
| verify-task-search-formal | descriptionMatch | 8f7ee357d351621110b84bbc1e62058c7b096685abbf582e94a0c44006e0f1b3 / 8f7ee357d351621110b84bbc1e62058c7b096685abbf582e94a0c44006e0f1b3 | identical to SERVER-READS |

## Proof ledger

Every outer command has a .receipt.json with argv, actual exit/signal, start/end and load. Failed attempts remain evidence. The AtomicCAS pre-renewal run exited 1 solely at the store source hash after the model and production stages passed. The actual-source sensitivity adapter preserves both stock mutants and literal behavioral expectations; each mutant exits 1 before hashes, exact restoration succeeds, and the restored pre-renewal command exits 1 at hashes. Its stock final prose says restored 0, but result.json records the actual restored 1; that prose is not used as evidence. The adapter changes only the initial reviewed-source binding and restored stale-hash expectation, not a control or a model.

## Next merges and limits

Mac candidate 8 remains a separate merge. Its worker owes check-swift, the Task search — Headless proof during HOLD stage in verify-macos/features/task-search.md, and its 18 gates on the final source. No Swift was run here. Later stream-wake work must preserve lease validation, single-check active/terminal selection, one-shot terminal cursor/generation caps, valid unscoped Token final delivery and reload ordering. CLI routing must preserve early flag refusals and Snapshot restore outside owner read scopes. All later merges must preserve preview's file-cleanup guard and Snapshots attachmentRoot argument.

Independent merged-head review by both seats is pending. Bounded models, observed timing and fixture parity do not prove unbounded safety, power-loss behavior or native clients.

The one AtomicCAS renewal identifies merged product 4d709efa. The other three mappings identify immutable capture 5f46e7b3, which has byte-identical product files and includes that reviewed AtomicCAS map for the DAG skill's nested check. These are both merged sources, not either parent. No mapping is advanced a second time. Each final command runs with current mapped source bytes checked against those immutable captures.

## Public DAG mapping details

The public map additionally covers redactTaskHistory. Its complete body equals PURGE-RESTORE, not SERVER-READS. The exact diff adds schema-derived referencing-row deletion, avoids rewriting identical redacted History/checkpoints, toggles immutable triggers only when needed and returns whether changes occurred. The same write transaction still removes the Task, its incident edges and references and preserves surviving Versions. Move/Purge is expressly outside TLA+ in mapping.md; production lifecycle, raw History, repair, future-table and public controls establish that concrete boundary. No model step or invariant changes. The full store bodies named by the public map match SERVER-READS and both parents as listed above. Every other public-covered file except CLI main is identical to SERVER-READS.

CLI public bodies dependencyCommand, batchDependCommand and the false-filter guard match both parents. The complete mutation closure, including deletion confirmation and malformed-Version admission, matches PURGE-RESTORE. Its exact parent diff restricts registrations and separates the typed edit/deletion inputs. Valid rm still passes the same confirmation, preview and fingerprint fields. Unsupported flags stop before Resolve/Begin and cannot add a model transition. The public DAG recipe and the 130 cold refusals cover that boundary. public-bodies.json supplies hashes and source-diffs/ the complete diffs.

The initial 37-stream attempt found a verification fixture race, not an authorization-result change: restore-absent-expired-token observed an expired row, but scheduler cleanup removed it before the baseline's check, producing invalid_credential rather than the intended expired literal. The fixture now retains that selected row only after restore and before advancing its injected Clock, as the existing CLI auth-history fixture does. All 37 scenarios pass with their original frame expectations. The direct restore-removal case still asserts a missing row and is untouched. Both terminal withholding and reload-dropping mutations still fail the literal frame comparisons. The approved exception predicate is unchanged.

The direct compiled public-entry observer also proves the strongest restore condition: the actual CLI helper exits 0 and actual HTTP restore replies 200, each with the literal RESTORE_ENTRY_TRANSACTION false before the restore's first statement. The observer throws if either wrapper holds a transaction. An initial fixture reused the CLI Snapshot after server startup's normal daily retention pruned it, giving 404; the corrected fixture creates the HTTP Snapshot after startup. The failed captures and actual exits are preserved. No product change was needed.

## Evidence storage

All evidence is ignored and local under docs/evidence/ui-speed/integ-server, with formal skill runs retaining their own evidence directories. The 57 raw differential captures were losslessly gzip-compressed, verified by round-trip equality and SHA-256, and reduced from 1,010,996,908 to 23,718,239 bytes. reply-capture-hashes.json records original names, hashes and sizes; each .json.gz retains all reply bytes for review. Rebuildable closed binaries are retired with hashes in retired-binaries.jsonl. Neither input branch moved.

The first complete DAG public attempt stopped at tty-default-yes because the reviewed CLI flag factory dedented the confirmation by two spaces. Twenty-one preceding controls had their intended behavioral failure and exact clean restoration. The anchor is corrected by deleting those two spaces in from and to only; it still changes initial false to true at the same Prompt.Confirm, with unchanged mode/property and total control count. No product, model, invariant, bound, expected output or pin changes. The full default is repeated on the same immutable merged source. The original failure and the two-line diff remain evidence.

A preflight of all 53 public anchors found one further reviewed binding rename before the repeated public stage began: empty-present-fingerprint still named input.fingerprint, while the merged typed factory names the same value deletion.fingerprint. Both from and to are updated to that binding only. It still mutates optional empty-string handling by adding || undefined and must fail public-boundary-delete. All 53 anchors then matched exactly once against immutable product 5f46e7b3. The unchanged model/production stages are independent of these public-anchor spellings; the corrected verifier inputs were committed before the public stage loaded them.

## Completed qualification

All four mappings are qualified on merged immutable source, with no second reference move. AtomicCAS points to 4d709efa; cache, DAG and Task search point to 5f46e7b3, which includes the renewed AtomicCAS map for nested verification. All 171 runtime source files are byte-identical to 5f46e7b3 at final delivery. Both input branches remain exactly at their reviewed SHAs.

| Mapping | Actual exits and evidence |
| --- | --- |
| AtomicCAS | Pre-renewal 1 at hashes only after model/production success; actual-source mutants 1 and 1 at behavioral assertions, restored pre-renewal 1 only at hashes; final one-command 0. fv01-check-ItK7l9, sensitivity-WmK2qC, and atomic-final.log. Constructor: 10 executed statements, 2 transaction boundaries and the identical seed fd68adcacf2ab99704d59ef4abae846ce20a1caa47ac795d886138ca7e4c9157 across both parents and merge. |
| Task search cache | Seven source controls and three observer controls passed before stale hash exits 1; full fresh command 0 with all nine stages 0 at perf-cache/verify-DGFnwV. Initial shared Java-temp parser error exits 150/outer1 are retained; isolated JAVA_TOOL_OPTIONS temp directory fixes the environment without changing a model/control. |
| DAG formal | Final stock default 0 at dag-formal/check-WgsuTG: all model stages, compiler/nested guards, 36 production mutants and 53 public mutants, each with intended failure and exact restoration. Production: /Users/zambamon/.t3/worktrees/todo-cli/perf-server-reads-9744ac14607d1d91/docs/evidence/dag-formal/conformance-kmPKYy. Public: /Users/zambamon/.t3/worktrees/todo-cli/perf-server-reads-9744ac14607d1d91/docs/evidence/dag-formal/public-fJpqXD. The prior cleanup-concurrency and stale-anchor outer exits 1 remain in their receipts. Only the two documented anchor spellings changed, not their mutations or counts. |
| Task search formal | Full command 0 at task-search-formal/check-WnN9Jb, including real matcher properties/controls, restored checks and current hash/type gates. Positive model queues ended empty; intentional safety/liveness controls have their required exits 12/13. Swift stage is owed as named below. |

## Both branches' behavior proofs

- 57 fixtures and 25,147 byte-identical reply pairs against 8292b067, including auth History and last-use parity. Both mutation modes each pass all 1,267 rich-fixture replies and their real hook counters; two interleaved Profiles pass.
- 840 absent replies equal the same base; all 14 statement probes require only credential lookup and classification. Lifetime/authorization/copy/origin/Diagnostics domain selection: 73 tests pass. The root domain suite passes 462 tests.
- All 37 stream scenarios pass with only the already approved ended-authority differences. The pre-Purge restore scenario passes 3/3 frames and literal redaction/non-resurrection checks. Session-only terminal and dropped-reload mutants each exit 1 on their literal frame comparison.
- Diagnostics structural/refusal/writer/sensitivity checks pass. Ten caller classes retain exact refusals and one rejected-authentication History row per refusal; successful reads call credentialUsed once and complete synchronously with real Snapshots. A writer attempted during a paused lease waits, then commits before reader exit. Its measured wait was 81.24 ms within the 259.35 ms paused read. The three authority/materialization mutants each exit 1 with their literal messages.
- verify-snapshots passes using the genuine compiled 6b167266 CLI to damage the copy and the merged CLI to repair it twice. Eight warm/fresh cleanup cases assert jobs and Purged image bytes are gone at restore return; the 17-command preview matrix preserves all rows and file tree state; raw-History cases and custom-root/guard controls pass.
- Flag help/schema inventory has 802 accepted pairs: 800 consumers and only init/login username compatibility exceptions. The complete 65-pair cold matrix passes both formats, 130 refusals before authentication/store creation; it preserves the pre-seeded disclaimer file and the scratch tree.
- verify-attachments plus CLI01, verify-dag plus public/closure, verify-cli, verify-discovery, verify-auth, verify-profiles, verify-import, verify-server-api plus reads/writes, verify-sse and the compiled lease-window controls all exit 0.
- Root check: sh scripts/disk-guard.sh exits 0, then /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check exits 0. Counts: domain462, CLI73, server32, Electron168, one existing Electron skip. OpenAPI/contract generation check is included. Contract remains 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289; no API/generated contract bytes changed.

## Paired measurements

Five alternating pairs on the owner-shaped fixture, two passes per pair, cover 160 successful reads. The second-pass eight-handler sum is 1,018.53 ms [989.74, 1,223.56] on 8292b067 versus 21.74 ms [17.71, 24.56] on the merge. The corresponding client sums are 1,071.20 ms [1,042.95, 1,294.66] versus 32.92 ms [23.93, 37.27]. First-pass handler medians are 1,196.65 and 33.21 ms. Every head read has zero unnecessary operation decodes; the base decodes 52,200 events per eight-read pass. Load was 18.21–20.75 on 10 cores, so these are paired evidence under load, not idle-machine absolute thresholds. Both arms use the same compiled Bun runtime, SQLite configuration, fixture and response/count assertions. The original sampled CPU/component evidence in server-cold-path-report.md identifies whole-log JSON/schema materialization as the removed cost; current decode counters prove it was removed rather than skipped replies. Remaining projection/encoding and scheduling costs keep the gain finite. The response pairs separately prove returned content.

The 22-route lock sweep uses five alternating pairs per route. Values below are median/minimum/maximum of each request's longest individual physical transaction, in ms; they are not sums of nested/savepoint times. Diagnostics' larger hold is the accepted IMMEDIATE cost, not an absolute timing assertion. Discovery keeps its deferred snapshot. All measured ordinary non-stream HTTP reads counted one credential lookup.

| Route | Base median / min / max | Merged median / min / max | Merged modes |
| --- | --- | --- | --- |
| /profiles | 114.60 / 111.59 / 130.00 | 3.09 / 2.70 / 9.54 | immediate |
| /profiles?include_projects=true | 639.10 / 568.38 / 698.37 | 3.86 / 2.33 / 6.75 | deferred |
| /tasks/lookup?prefix=a | 622.29 / 566.37 / 730.93 | 16.35 / 12.08 / 18.02 | deferred |
| /auth/tokens | 0.18 / 0.16 / 0.19 | 0.22 / 0.13 / 0.25 | immediate |
| /snapshots | 0.38 / 0.22 / 0.98 | 0.72 / 0.31 / 0.76 | immediate |
| /snapshots/00000000-0000-4000-8000-000000000000 | 0.09 / 0.07 / 0.12 | 0.45 / 0.23 / 0.50 | immediate |
| /diagnostics | 14.25 / 8.41 / 30.28 | 60.92 / 54.72 / 64.07 | immediate |
| /profiles/p0/projects | 94.64 / 75.24 / 109.66 | 0.30 / 0.22 / 0.34 | immediate |
| /profiles/p0/tags | 64.27 / 57.79 / 80.71 | 0.43 / 0.31 / 1.14 | immediate |
| /profiles/p0/tasks | 78.34 / 74.64 / 106.37 | 2.23 / 2.03 / 2.54 | immediate |
| /profiles/p0/tasks?text=Task | 105.09 / 67.73 / 144.05 | 2.29 / 1.66 / 7.01 | immediate |
| /profiles/p0/views/inbox | 76.72 / 71.69 / 107.79 | 2.62 / 1.29 / 2.85 | immediate |
| /profiles/p0/views/today | 104.51 / 101.96 / 142.52 | 2.83 / 2.42 / 9.72 | immediate |
| /profiles/p0/views/overdue | 123.11 / 93.86 / 149.92 | 2.24 / 1.76 / 2.72 | immediate |
| /profiles/p0/views/scheduled | 96.02 / 92.97 / 115.85 | 2.43 / 2.30 / 3.57 | immediate |
| /profiles/p0/tasks/p0-t0000 | 104.17 / 84.05 / 130.11 | 2.59 / 1.63 / 2.85 | immediate |
| /profiles/p0/tasks/p0-t0000/history | 77.44 / 59.91 / 86.40 | 50.97 / 38.26 / 60.42 | immediate |
| /profiles/p0/tasks/p0-t0000/graph | 85.55 / 64.45 / 95.99 | 4.20 / 3.86 / 5.22 | immediate |
| /profiles/p0/tasks/p0-t0000/attachments/missing/image | 94.77 / 73.23 / 191.25 | 2.94 / 2.07 / 3.22 | immediate |
| /profiles/p0/quick-add/parse | 0.18 / 0.13 / 0.65 | 0.25 / 0.21 / 0.62 | immediate |
| /profiles/p0/events | 0.27 / 0.14 / 0.97 | 0.42 / 0.26 / 0.61 | immediate |
| /snapshots/:real | 0.19 / 0.14 / 0.21 | 0.27 / 0.23 / 0.47 | immediate |

Diagnostics also has 200 paired alternating reads per fixture against the pre-owner-scope source 70b60e22, with normalized body equality on every pair and full-body/synchronous controls. Longest writer hold median / p99 / maximum, in ms:

| Fixture | Before hold | Merged hold | Total read median before / merged |
| --- | --- | --- | --- |
| owner, 0 checkpoints | 10.43 / 21.76 / 34.73 | 62.63 / 99.38 / 123.38 | 64.08 / 62.80 |
| snapshots, 16 checkpoints | 10.30 / 25.40 / 33.74 | 78.37 / 120.22 / 122.51 | 80.21 / 78.50 |

These total read distributions overlap; no measurable whole-read regression is established. The merged lease holds the lock through materialization, with exactly one physical transaction instead of three. A future owner-read deferred scope needs guarded Snapshot list and pending-reminder paths around OperationStore.transaction cleanup plus review of Snapshot preparation/recovery and filesystem consistency. The prior SQL profile identifies the full op_log future-time count as a principal cost even without checkpoints. That follow-up is not implemented here.

## Commands with actual exits

Every receipt preserves full argv, times, load and exit/signal. The table records failed setup/environment/anchor attempts as failures; expected red controls are not reported as clean gate passes. The initial plain shell attempts outside the launcher are also recorded: domain typecheck0; selected seven-file domain test73/0; initial constructor capture1 for a missing captured dependency link, corrected0; initial hash extractor1 for omitted indentation, corrected0; initial TypeScript-parser helper1 because this checkout has the native compiler stub, replaced by checked declaration selection0. No product change was made for any of those setup failures.

| Attempt | Exit | Command argv |
| --- | --- | --- |
| read-control-before-build | 0 | ["bun",".scratch/integ-server/build-read-control.ts","before",".scratch/integ-server/server-before"] |
| atomic-pre-sensitivity | 0 | ["bun",".scratch/integ-server/atomic-pre-sensitivity.ts"] |
| old-cli-build | 0 | ["bun",".scratch/integ-server/build-old-cli.mjs"] |
| control-before-deterministic-build | 0 | ["bun",".scratch/integ-server/build-read-control.ts","before",".scratch/integ-server/server-before-deterministic"] |
| prepare-checkpoints | 0 | ["bun","apps/server/scripts/prepare-read-benchmark.ts","/Users/zambamon/.t3/worktrees/todo-cli/feat-diag-core-4e65eb5a37d844b0"] |
| fixture-rich | 0 | ["bun","apps/server/scripts/read-fixture.ts",".scratch/integ-server/rich"] |
| fixture-presence | 0 | ["bun","apps/server/scripts/read-presence-fixture.ts",".scratch/integ-server/presence"] |
| control-after-build | 0 | ["bun",".scratch/integ-server/build-read-control.ts","after",".scratch/integ-server/server-after"] |
| cli-before-build | 0 | ["bun",".scratch/integ-server/build-read-cli.ts","before",".scratch/integ-server/cli-before"] |
| cli-after-build | 0 | ["bun",".scratch/integ-server/build-read-cli.ts","after",".scratch/integ-server/cli-after"] |
| interaction-probe | 0 | ["bun",".scratch/integ-server/interaction-probe.ts"] |
| recipe-snapshots | 0 | ["sh",".agents/skills/verify-snapshots/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/snapshots"] |
| recipe-attachments | 1 | ["bun",".agents/skills/verify-attachments/scripts/drive.ts","<checkout>/docs/evidence/ui-speed/integ-server/attachments"] |
| differential | 0 | ["bun","apps/server/scripts/read-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/fixtures.json","<checkout>/docs/evidence/ui-speed/integ-server/differential"] |
| recipe-attachments-cli01 | 0 | ["bun",".agents/skills/verify-attachments/scripts/cli01.ts","<checkout>/docs/evidence/ui-speed/integ-server/attachments-cli01"] |
| recipe-dag | 0 | ["sh",".agents/skills/verify-dag/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/dag"] |
| recipe-cli | 0 | ["sh",".agents/skills/verify-cli/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/cli"] |
| diag-fixtures | 0 | ["bun",".agents/skills/verify-diagnostics/controls/read-fixture.mjs"] |
| diag-before-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-scope-driver.mjs","before",".scratch/integ-server/diag-before"] |
| diag-good-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-scope-driver.mjs","good",".scratch/integ-server/diag-good"] |
| diag-no-port-check-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-scope-driver.mjs","no-port-check",".scratch/integ-server/diag-no-port-check"] |
| diag-closed-scope-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-scope-driver.mjs","closed-scope",".scratch/integ-server/diag-closed-scope"] |
| diag-retained-owner-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-scope-driver.mjs","retained-owner",".scratch/integ-server/diag-retained-owner"] |
| diag-structure | 0 | ["bun",".agents/skills/verify-diagnostics/controls/structural.mjs",".scratch/integ-server/diag-good",".scratch/integ-server/diag-before","docs/evidence/ui-speed/integ-server/diag-structure"] |
| diag-sensitivity | 1 | ["bun",".agents/skills/verify-diagnostics/controls/sensitivity.mjs",".scratch/integ-server/diag-no-port-check",".scratch/integ-server/diag-closed-scope",".scratch/integ-server/diag-retained-owner",".scratch/integ-server/diag-good","docs/evidence/ui-speed/integ-server/diag-sensitivity"] |
| cache-properties-pre | 1 | ["bun",".agents/skills/verify-task-search-cache/check.mjs","4d709efa94840a8cb08960d0ad35138cb96dcb9e"] |
| diag-sensitivity-correct-invocation | 0 | ["bun",".scratch/integ-server/diag-sensitivity.mjs","docs/evidence/ui-speed/integ-server/diag-sensitivity"] |
| cache-hygiene-pre | 1 | ["bun",".agents/skills/verify-task-search-cache/check-hygiene.mjs","4d709efa94840a8cb08960d0ad35138cb96dcb9e"] |
| atomic-final | 0 | ["bun",".agents/skills/verify-occ-atomicity/check.ts"] |
| stream-pre-purge-restore | 1 | ["bun",".agents/skills/verify-sse/scripts/restore-purge-integration.mjs",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/stream-pre-purge-restore"] |
| recipe-discovery | 0 | ["sh",".agents/skills/verify-discovery/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/discovery"] |
| stream-pre-purge-restore-corrected-driver | 1 | ["bun",".agents/skills/verify-sse/scripts/restore-purge-integration.mjs",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/stream-pre-purge-restore"] |
| dag-old-public-cli-build | 0 | ["bun",".scratch/dag-public-resume/build-pinned.mjs"] |
| stream-pre-purge-restore-deleted-fixture | 1 | ["bun",".agents/skills/verify-sse/scripts/restore-purge-integration.mjs",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/stream-pre-purge-restore"] |
| dag-formal | 1 | ["bun",".agents/skills/verify-dag-formal/check.mjs"] |
| task-search-formal | 0 | ["bun",".agents/skills/verify-task-search-formal/check.ts","5f46e7b3c36afaffe8f2328df6453b8546be27a5"] |
| cache-uncached-oracle | 0 | ["bun",".agents/skills/verify-task-search-cache/build-baseline.mjs","5f46e7b3c36afaffe8f2328df6453b8546be27a5","--uncached"] |
| cache-full | 1 | ["bun",".agents/skills/verify-task-search-cache/verify.mjs","5f46e7b3c36afaffe8f2328df6453b8546be27a5"] |
| recipe-auth | 0 | ["sh",".agents/skills/verify-auth/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/auth"] |
| stream-pre-purge-restore-frozen-history | 0 | ["bun",".agents/skills/verify-sse/scripts/restore-purge-integration.mjs",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/stream-pre-purge-restore"] |
| recipe-profiles | 0 | ["sh",".agents/skills/verify-profiles/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/profiles"] |
| mutation-boundary-build | 0 | ["bun","apps/server/scripts/build-read-boundary.ts",".scratch/integ-server/server-boundary"] |
| recipe-import | 0 | ["sh",".agents/skills/verify-import/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/import"] |
| boundary-credential | 0 | ["bun","apps/server/scripts/read-control.ts",".scratch/integ-server/server-after",".scratch/integ-server/server-boundary",".scratch/integ-server/rich/fixtures.json","<checkout>/docs/evidence/ui-speed/integ-server/boundary-credential"] |
| boundary-port | 0 | ["bun","apps/server/scripts/read-control.ts",".scratch/integ-server/server-after",".scratch/integ-server/server-boundary",".scratch/integ-server/rich/fixtures.json","<checkout>/docs/evidence/ui-speed/integ-server/boundary-port"] |
| recipe-dag-public | 0 | ["sh",".agents/skills/verify-dag/scripts/verify-public.sh","<checkout>/docs/evidence/ui-speed/integ-server/dag-public"] |
| interleaved-profiles | 0 | ["bun","apps/server/scripts/read-boundary-concurrency.ts",".scratch/integ-server/server-boundary",".scratch/integ-server/rich/fixtures.json","<checkout>/docs/evidence/ui-speed/integ-server/interleaved-profiles"] |
| recipe-dag-closure | 0 | ["sh",".agents/skills/verify-dag/scripts/verify-closure.sh","<checkout>/docs/evidence/ui-speed/integ-server/dag-closure"] |
| cache-full-isolated-java-temp | 0 | ["bun",".agents/skills/verify-task-search-cache/verify.mjs","5f46e7b3c36afaffe8f2328df6453b8546be27a5"] |
| lock-before-build | 0 | ["bun",".scratch/integ-server/build-lock-observer.mjs","before",".scratch/integ-server/lock-before"] |
| lock-after-build | 0 | ["bun",".scratch/integ-server/build-lock-observer.mjs","after",".scratch/integ-server/lock-after"] |
| recipe-server-api | 0 | ["sh",".agents/skills/verify-server-api/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/server-api"] |
| recipe-server-reads | 0 | ["sh",".agents/skills/verify-server-api/scripts/verify-reads.sh","<checkout>/docs/evidence/ui-speed/integ-server/server-reads"] |
| caller-audit | 0 | ["bun",".agents/skills/verify-server-api/scripts/read-caller-audit.mjs"] |
| presence-base | 0 | ["bun","apps/server/scripts/read-presence-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/presence/fixture.json","<checkout>/docs/evidence/ui-speed/integ-server/presence-base"] |
| recipe-server-writes | 0 | ["sh",".agents/skills/verify-server-api/scripts/verify-writes.sh","<checkout>/docs/evidence/ui-speed/integ-server/server-writes"] |
| presence-head | 1 | ["bun","apps/server/scripts/read-presence-control.ts",".scratch/integ-server/server-after",".scratch/integ-server/presence/fixture.json","<checkout>/docs/evidence/ui-speed/integ-server/presence-head","<checkout>/docs/evidence/ui-speed/integ-server/presence-base/replies.json"] |
| presence-statements | 0 | ["env","READ_PRESENCE_STATEMENTS=1","READ_PRESENCE_PROBE_ONLY=1","bun","apps/server/scripts/read-presence-control.ts",".scratch/integ-server/server-after",".scratch/integ-server/presence/fixture.json","<checkout>/docs/evidence/ui-speed/integ-server/presence-statements"] |
| streams37 | 1 | ["bun","apps/server/scripts/read-scope-stream-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","<checkout>/docs/evidence/ui-speed/integ-server/streams37"] |
| recipe-sse | 0 | ["sh",".agents/skills/verify-sse/scripts/verify.sh","<checkout>/docs/evidence/ui-speed/integ-server/sse","<checkout>/.scratch/bin/df91d975be6a-4d709efa9484/todo"] |
| early-flags130 | 1 | ["bun",".agents/skills/verify-cli/scripts/check-integrated-early-flags.mjs",".scratch/bin/df91d975be6a-4d709efa9484/todo","docs/evidence/ui-speed/integ-server/cli","docs/evidence/ui-speed/integ-server/early-flags130"] |
| presence-head-correct-output | 0 | ["bun","apps/server/scripts/read-presence-control.ts",".scratch/integ-server/server-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/presence-head-corrected.json","docs/evidence/ui-speed/integ-server/presence-base"] |
| recipe-lease-window | 0 | ["bun",".agents/skills/verify-auth/scripts/check-read-lease-window.mjs","<checkout>/docs/evidence/ui-speed/integ-server/lease-window"] |
| early-flags130-disclaimer-fixture | 0 | ["bun",".agents/skills/verify-cli/scripts/check-integrated-early-flags.mjs",".scratch/bin/df91d975be6a-4d709efa9484/todo","docs/evidence/ui-speed/integ-server/cli","docs/evidence/ui-speed/integ-server/early-flags130"] |
| dag-formal-serial-retry | 1 | ["bun",".agents/skills/verify-dag-formal/check.mjs"] |
| streams37-retained-expiry-fixture | 0 | ["bun","apps/server/scripts/read-scope-stream-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-after",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/streams37-expiry-fixture"] |
| paired-eight-reads | 1 | ["/usr/bin/lockf","-k","/tmp/todo-perf-measure.lock","bun",".scratch/integ-server/eight-read-timing.ts","ambient",".scratch/server-reads/checkpoints","docs/evidence/ui-speed/integ-server/paired-eight"] |
| paired-route-locks | 0 | ["/usr/bin/lockf","-k","/tmp/todo-read-lock-measure.lock","bun",".agents/skills/verify-server-api/scripts/paired-read-locks.mjs",".scratch/integ-server/lock-before",".scratch/integ-server/lock-after",".scratch/integ-server/fixtures.json","docs/evidence/ui-speed/integ-server/paired-route-locks"] |
| paired-eight-reads-with-inputs | 0 | ["/usr/bin/lockf","-k","/tmp/todo-read-lock-measure.lock","bun",".scratch/integ-server/eight-read-timing.ts","ambient",".scratch/server-reads/checkpoints","docs/evidence/ui-speed/integ-server/paired-eight"] |
| terminal-mutant-build | 0 | ["bun",".scratch/integ-server/build-read-control.ts","after",".scratch/integ-server/server-terminal-mutant"] |
| terminal-mutant | 1 | ["bun","apps/server/scripts/read-scope-stream-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-terminal-mutant",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/terminal-mutant"] |
| reload-mutant-build | 0 | ["bun",".scratch/integ-server/build-read-control.ts","after",".scratch/integ-server/server-reload-mutant"] |
| reload-mutant | 1 | ["bun","apps/server/scripts/read-scope-stream-control.ts",".scratch/integ-server/server-before-deterministic",".scratch/integ-server/server-reload-mutant",".scratch/integ-server/cli-before",".scratch/integ-server/cli-after",".scratch/integ-server/presence/fixture.json","docs/evidence/ui-speed/integ-server/reload-mutant"] |
| root-check | 0 | ["/usr/bin/lockf","-k","/tmp/todo-pnpm-check.lock","pnpm","check"] |
| diag-read-before-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-read-driver.mjs","before",".scratch/integ-server/diag-read-before"] |
| diag-read-after-build | 0 | ["bun",".agents/skills/verify-diagnostics/controls/build-read-driver.mjs","after",".scratch/integ-server/diag-read-after"] |
| diagnostics-paired400 | 0 | ["/usr/bin/lockf","-k","/tmp/todo-perf-measure.lock","bun",".scratch/integ-server/paired-diagnostics.mjs"] |
| restore-entry-cli-build | 0 | ["bun",".agents/skills/verify-snapshots/scripts/build-restore-entry.mjs","cli",".scratch/integ-server/restore-entry-cli"] |
| restore-entry-server-build | 0 | ["bun",".agents/skills/verify-snapshots/scripts/build-restore-entry.mjs","server",".scratch/integ-server/restore-entry-server"] |
| public-restore-entry | 1 | ["bun",".agents/skills/verify-snapshots/scripts/restore-entry.mjs",".scratch/integ-server/restore-entry-cli",".scratch/integ-server/restore-entry-server","docs/evidence/ui-speed/integ-server/public-restore-entry"] |
| public-restore-entry-path-capture | 1 | ["bun",".agents/skills/verify-snapshots/scripts/restore-entry.mjs",".scratch/integ-server/restore-entry-cli",".scratch/integ-server/restore-entry-server","docs/evidence/ui-speed/integ-server/public-restore-entry"] |
| public-restore-entry-live-snapshot-fixture | 0 | ["bun",".agents/skills/verify-snapshots/scripts/restore-entry.mjs",".scratch/integ-server/restore-entry-cli",".scratch/integ-server/restore-entry-server","docs/evidence/ui-speed/integ-server/public-restore-entry"] |
| dag-formal-final-anchor | 0 | ["bun",".agents/skills/verify-dag-formal/check.mjs"] |

The original streams37 attempt1 is the documented scheduler/expiry fixture race; streams37-retained-expiry-fixture0 is the corrected full matrix. presence-head1 used an incorrect output filename, then presence-head-correct-output0 compared the same 840 replies. The first early-flags attempt1 lacked the normal disclaimer fixture, then the 130-case run0 included that fixed literal file. The restore/Purge helper had parser/setup/literal-count attempts1 before its correct pre-Snapshot redacted-history expectation passed0. Public restore-entry attempts1 used a Snapshot removed by normal retention; creating its HTTP fixture after startup passed0. The first paired-eight invocation1 omitted two reusable imports; the complete-input run0 is the only reported timing run.

## What remains owed

Both correctness seats must re-check this merged head and the four renewals, including the two DAG control-anchor corrections and the stream expiry-row fixture guard. No independent merged-head acceptance is claimed here. Mac candidate8 is not merged. Its worker owes check-swift, exactly the Task search — Headless proof during HOLD stage in .agents/skills/verify-macos/features/task-search.md, and its 18 gates on the final merged source. No Swift/native app/Keychain/signing was run. Later stream-wake and CLI routing merges must preserve both constructor arguments, restore outside owner read leases, preview cleanup isolation, runtime authority/lease checks, the one-shot terminal limits/reload order, and all early flag refusals.
