# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Body Creator** — iOS app (SwiftUI, iOS 16+, iPhone-only, portrait) that is a library of transparent PNG stickers for Instagram Stories, aimed at health/aesthetics professionals. The user picks a sticker and a patient photo; the app hands both to Instagram, which opens a story with the photo as background and the sticker as a draggable layer.

The product/design spec is `docs/superpowers/specs/2026-07-17-figurinhas-stories-design.md` (read section 5b before touching the Instagram flow). Pre-release steps live in `docs/RELEASE_CHECKLIST.md`.

Internal names are still `Figurinhas` (target, scheme, `Figurinhas.xcodeproj`) while the product is "Body Creator" — this mismatch is deliberate, not drift.

## Generated files — never edit by hand

`project.yml` (XcodeGen) is the single source of truth. Both of these are generated from it and are gitignored:

- `Figurinhas.xcodeproj`
- `App/Info.plist` — editing it directly is silently discarded on the next generate; change `targets.Figurinhas.info.properties` in `project.yml` instead.

**Run `xcodegen generate` after any `project.yml` change and after adding any new file or folder** — sources are resolved into static file lists, so new files are invisible to the build until you regenerate.

## Commands

```bash
xcodegen generate     # after adding files or editing project.yml

DEST="platform=iOS Simulator,name=iPhone 17 Pro"
xcodebuild test  -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST"
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST"

# single test / single class
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" \
  -only-testing:FigurinhasTests/CatalogStoreTests/testSearchIgnoresCaseAndAccents

python3 Scripts/validate_content.py Content   # same check the build runs
swift Scripts/generate_placeholders.swift Content   # regenerate placeholder stickers
swift Scripts/generate_appicon.swift                # regenerate placeholder icon
```

`-quiet` suppresses the `** TEST SUCCEEDED **` banner on this toolchain — judge by exit code, or drop the flag.

Two test targets run under one scheme: `FigurinhasTests` (unit) and `FigurinhasUITests` (one end-to-end flow).

## Architecture

Four modules with one-way dependencies: **UI → {Catalog, Favorites, Export}**.

- **Catalog** — `ManifestLoader` reads `Content/manifest.json`; `CatalogStore` (`@MainActor ObservableObject`) exposes packs to the UI. It is the only thing that knows where content comes from: swapping bundle→server later happens here alone. It drops stickers whose file is missing and prunes categories left empty, so a bad manifest degrades to an empty catalog instead of crashing.
- **Favorites** — sticker ids in `UserDefaults` under `favoriteStickerIDs`.
- **Export** — `StickerExporter` (Instagram + pasteboard), `InstagramSharing` (Facebook App ID).
- **UI** — the four screens; stores arrive via `@EnvironmentObject`, injected once in `FigurinhasApp`.

### Content pipeline

`Content/` holds `manifest.json` plus one folder of PNGs per pack, copied into the bundle as a folder reference. Adding stickers = drop PNGs + edit the JSON. `Scripts/validate_content.py` runs as a **pre-build phase and fails the build** on: missing file, duplicate id, PNG without alpha, >2 MB, or longest side outside 512–2048 px. Sticker ids must be unique **globally**, not per pack — favorites are stored as bare ids.

### Instagram integration (the core mechanic)

`shareToInstagramStories` puts `com.instagram.sharedSticker.backgroundImage` (the chosen photo, JPEG) and `com.instagram.sharedSticker.stickerImage` (the sticker PNG) on the pasteboard, then opens `instagram-stories://share?source_application=<FacebookAppID>`.

Constraints that are easy to get wrong:

- **The sticker PNG's bytes must reach the pasteboard unchanged.** Re-encoding through `UIImage` can drop the alpha channel, which breaks the whole product. `UIImage(data:)` is used only to validate, never to re-encode.
- A **Facebook App ID is mandatory** (Meta requirement since Jan 2023) — in `Export/InstagramSharing.swift`. Empty ⇒ `.missingFacebookAppID`.
- This API **always creates a new story**. There is no way to inject a sticker into a composition already open in Instagram, and a photo taken inside Instagram is unreachable from other apps. The "Só copiar a figurinha" button (PNG on the pasteboard, pasted by long-press) is the deliberate answer to both cases, and the only route for multiple stickers on one image.
- Camera: check `AVCaptureDevice.authorizationStatus` **before** presenting `CameraPicker` — `UIImagePickerController` renders a black screen when access is denied instead of failing.

## Conventions

- All user-facing text in **pt-BR**.
- iOS 16.0 floor — no iOS 17+ API (e.g. `ContentUnavailableView`, two-parameter `onChange`).
- The app links Apple frameworks only; no package dependencies.
- UI elements the end-to-end test drives carry `accessibilityIdentifier`s (`sticker-<id>`, `take-photo`, `copy-only`, …) — keep them in sync with `UITests/BodyCreatorUITests.swift`.
- SwiftUI's `confirmationDialog` cancel button is not exposed to XCUITest; avoid asserting on it.
- The app collects no data and stores no photos (the photo goes only to the local pasteboard) — keep the "Data Not Collected" privacy label and `App/PrivacyInfo.xcprivacy` (UserDefaults, reason CA92.1) true as the code changes.
