# LOXT project instructions

## Style matching

Before writing UI code, study existing components, class names, spacing, colors and layout. Match the established LOXT style: SUIT, charcoal surfaces, existing dark/light theme tokens and brand assets. Do not introduce a new aesthetic or unrelated feature.

## Approval and scope

Never silently modify existing code or content outside the user's approved task. Describe a necessary change and ask first if it is not already authorized. An explicit implementation request approving a discussed proposal authorizes its necessary edits; do not ask for the same approval again. Investigation-only and discussion-only requests must not result in implementation.

## Finish approved implementation requests

On 2026-10-05 the user requested that the release preparation below happen automatically after implementation, without a separate reminder. Treat it as part of an approved application implementation task:

1. Finish relevant tests and generate the Windows installer. Keep application, installer and release versions consistent. Use a minor increment for added features and a patch increment for fixes, following the current version. Website/documentation-only work does not require an application version bump.
2. Write `docs/release-<version>.md` and provide copyable release text in the final response.
3. Update root `README.md` to the actual implemented features, current version, current app screenshots and license information. Do not invent supported functionality or performance claims.
4. Update the introduction website while retaining its existing design. Capture the current packaged app using a **private sample profile**, including screens for the changed features. Sample transcripts and scripted Live states are UI examples, never inference evidence. Preserve user recordings, memos, folders, models and settings.
5. Keep `landing/release.mjs`, site metadata, screenshots manifest, download and release URLs consistent with the installer. The URL convention is `https://github.com/threetrue03/loxt/releases/download/v<version>/LOXT-Setup-<version>-x64.exe`. Check publication when possible; a configured URL is not proof that its release asset exists.
6. Run `node landing/scripts/release.mjs` after updating site copy and capture scenarios. It syncs version metadata, captures the app, refreshes README home screenshots, builds, checks desktop/mobile UI and creates `landing/loxt-site-v<version>.zip`.
7. Provide Windows PowerShell commands for updating the source on GitHub. If needed, include the persistent Git PATH setup. Do not force-push or discard changes to resolve a rejected push.
8. Report installer and site ZIP paths, verification results, and any remaining release upload / Production deployment steps. See `docs/RELEASE-WORKFLOW.md`.

This is an end-of-task workflow, not a scheduled automation. Do not automatically commit, push, upload a GitHub release, or publish to Cloudflare merely because local preparation is complete. Those external actions require the user's instruction for that action. Do not claim the public website or GitHub README changed until publication actually happened.
