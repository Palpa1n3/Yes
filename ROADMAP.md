# Alton roadmap (towards 1.0)

Agreed with the owner on 27 Nov 2026. Each item ships as its own tested release, pushed once all
checks pass. Status: ✅ done · 🔶 started · ⬜ not started.

## Phase 1: Safety foundations (current)

Order inside the phase: backups → rollback → limits → recovery → change checks → conflicts →
hidden instructions → encrypted sync.

- 🔶 Automatic configuration and memory backups. **0.81:** every data file (settings, notes,
  memories, routines, chats, shifts, habits, plugins, the mod tools' records); a manifest per
  backup records which files were readable; 7 daily + 4 weekly kept; a copy before every update;
  a damaged data file is put back from the newest good backup at start-up. Still to do: show
  "damaged" backups in Settings › Privacy › Backups.
- ⬜ Automatic update rollback (the "before update" backups are the data half of this).
- ⬜ API usage and spending limits.
- ⬜ Crash and unexpected shutdown recovery.
- ⬜ Persistent task state across restarts (saving progress; resuming comes in Phase 4).
- ⬜ Verification of system changes before and after execution.
- ⬜ Detection of unintended changes.
- ⬜ Protection against conflicting automated tasks.
- ⬜ Protection against malicious instructions embedded in websites and documents.
- ⬜ Encrypted cross-device synchronization.
- ✅ PIN authentication kept instead of biometrics.

Also in 0.81 (asked for alongside Phase 1): **easier Android updates**: the new version
downloads in the background, is checked (same app, same signing key) and is installed through
Android's PackageInstaller when you leave Alton. After the first such update, Android 12+ needs
no Install screen. Switch: phone app › Settings › This app › Update automatically.

## Phase 2: Unified intelligence

- ⬜ Central intelligence engine connecting all existing capabilities.
- ⬜ Shared contextual awareness across applications.
- ⬜ Cross-device conversation continuity.
- ⬜ Intelligent memory consolidation.
- ⬜ Personal knowledge graph.
- ⬜ Predictive assistance.
- ⬜ Automatic AI model selection.
- ⬜ Confidence assessment and information verification.

## Phase 3: Self-development

- ⬜ Self-diagnosis and error analysis (partly there: Alton reads its own errors and code).
- ⬜ Source code analysis.
- ⬜ Autonomous improvement proposals.
- ⬜ Sandboxed development and testing.
- ⬜ Automated regression testing.
- ⬜ Approval-based code modifications.
- ⬜ Development roadmap management (partly there: Notes › "Alton roadmap").
- ⬜ Automatic documentation.
- ⬜ Performance benchmarking.

## Phase 4: Persistent agents

- ⬜ Multiple simultaneous background tasks.
- ⬜ Pause, resume, edit and cancel tasks.
- ⬜ Long-running projects spanning multiple days.
- ⬜ Task recovery across restarts.
- ⬜ Automatic result verification.
- ⬜ Learning from successful workflows.
- ⬜ Specialized AI agents.
- ⬜ Intelligent task prioritization.

## Phase 5: Personality refinement

- ⬜ Consistent personality across devices and AI models.
- ⬜ Context-sensitive humour and sarcasm.
- ⬜ Dynamic voice expression.
- ⬜ Natural conversational pauses.
- ⬜ Constructive disagreement.
- ⬜ Configurable initiative levels.
- ⬜ Personalized interactions based on memories and habits.

## Phase 6: Final stability and version 1.0

- ⬜ Full integration testing.
- ⬜ Desktop and mobile synchronization testing.
- ⬜ Performance optimization.
- ⬜ Security auditing.
- ⬜ Long-duration reliability testing.
- ⬜ Interface consistency.
- ⬜ Error handling and recovery testing.
- ⬜ Final bug fixes.
