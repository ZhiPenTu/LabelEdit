# v0.2.7 delivery and acceptance record

## Repository and contract boundaries

The platform work started from main 6042881, including the v0.2.5 interface corrections and subsequent reinstall fix. Business sources retain that origin in their independent MIT repositories. Previous desktop and plugin Release assets remain unchanged.

The Harness remains 0.2.1-alpha.1. Runtime API is 1.1.0, manifestVersion remains 1, and API ^1.0.0 plugins remain accepted. SDK 1.1.0 was published first; the corrected visible-view testing helper was released as immutable SDK 1.1.1. Independent lockfiles pin that public tarball with integrity.

## Completed local acceptance

- Platform: 2 frontend tests, 59 platform tests and 7 Electron acceptance tests passed. These cover signed install/update rejection, failed plugin upgrade preservation, migration, file ownership, disposal races, multipart budgets, response limits, isolated credentials, cancellation and real ASAR byte handling.
- Packaged pure platform: launched outside the checkout; all seven Harness services start, the tool center is empty and no bundled business plugin directory exists.
- LabelEdit: 16 frontend tests and 11 Python tests plus 4 subtests passed. The frozen independent artifact runs in the real native sandbox, opens a PDF, performs real offline OCR, applies replacement text, renders the edited preview, exports a PDF whose extracted text contains the replacement, and invalidates replaced-document resources.
- Legacy LabelEdit API 1.0: its actual previous artifact performs real OCR and uses the retained PDF-specific preview URL in the new pure platform.
- remove.bg: simulated PNG success/save, 401/402/429 errors, invalid PNG, input limits, cancellation and no retry passed, including the packaged host. No real billing request was made.
- Public market: remove.bg 0.1.1 installed from its own Release through the signed public catalog, not through local import.
- macOS: a digest-verified public v0.2.5 application ran its original packaged updater, rejected the new component signature domain before reconstruction, selected the full ZIP fallback, replaced itself and retained an independently installed API 1.0 plugin, user document and disabled legacy restoration state. Trust for this local test uses a fixture key; production component signatures are checked separately by CI.
- New component reconstruction: only core, electron and dependencies are emitted; stale bundled plugin files do not survive reconstruction. A rebuilt codesign-valid pure application starts normally.

## CI and publication provenance

Each plugin CI downloads an explicit successful platform run ID through the SDK testing helper, with an independent user directory and no checkout of the platform sources. Initial pinned acceptance run: 38010201251. Platform run 38011014629 additionally verifies real Windows v0.2.5 NSIS installation, invalid-installer preservation, pure-platform upgrade, legacy prompt and plugin-directory retention. Subsequent validation includes the raw-ASAR updater correction.

- Final runtime acceptance: platform run 38012253834, commit 08e29b1, passed both macOS and Windows packaging, pure-platform runtime, installer upgrade and component reconstruction. PR validation run 38012702348 passed both platforms after the local legacy-upgrade path correction.
- SDK sdk-v1.1.1: run 38010197025, public tarball SHA-256 847ff424e527b21a85885bcb411837a171025f78808393c52967b19a2c07d96e.
- LabelEdit v0.1.2: release run 38012280994 passed both platforms. Public darwin-arm64 artifact is 184431411 bytes, SHA-256 08d8c745a16ff9ab91941951bf1b832cd99fb0271b9724bab8a06efd8e44b88f; win32-x64 is 144496464 bytes, SHA-256 3861cd026f03efe72f2cc8e5c6fd2144110fbe282a4c9edaf25387369f1149ff.
- AI remove.bg v0.1.1: release run 38011279676 passed both platforms. Public darwin-arm64 artifact SHA-256 db3aad5f0f19331f3a942e28c8d58db03f20650b336fa9e6a941cda337d93bd0; win32-x64 SHA-256 092162476bb866cdb87bbc06b5ea602864224eed089c468ac6e362714a9d9b5a.
- Signed catalog onboarding: remove.bg market PR 1 and LabelEdit market PR 2. LabelEdit ingest run 38013493628 and same-head validation run 38013642746 passed. The ingest job downloads and validates both public artifacts before signing them; it never runs plugin code.
- Independent plugin follow-up acceptance pins platform run 38012253834 explicitly, rather than a floating latest build. remove.bg run 38013578336 passed both platforms; LabelEdit run 38013575927 is tracked separately.

Public repository releases and signed market PRs are the publication evidence. Market signing keys are not present in plugin repositories. Immediate cross-repository dispatch is implemented but requires a restricted MARKET_TRIGGER_TOKEN; without it, the market scheduled workflow checks registered formal releases and proposes PRs. Manual dispatch was used for initial onboarding.

## Explicitly unverified or separate acceptance

- Current local hardware is macOS 27.0.1, not the minimum macOS 14 system. Mach-O deployment metadata checks and dual-platform CI do not replace minimum-system physical acceptance.
- Windows CI installation/update is not a Windows minimum-system physical-machine acceptance.
- Real remove.bg billing, a real account's quota depletion and real public-service throttling were not exercised.
- Initial plugin publication alone does not prove independent subsequent updates; a separate post-v0.2.7 release and market merge must verify the installed host remains byte-identical.
