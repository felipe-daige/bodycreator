# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Body Creator** — sticker infoproduct for Instagram Stories, aimed at health/aesthetics professionals. Four subsystems in one repo:

| Directory | What it is |
|---|---|
| `App/ Catalog/ Export/ Favorites/ UI/` | iOS app (SwiftUI, iOS 16+, iPhone-only). Picks a sticker + patient photo, hands both to Instagram. |
| `server/` | Backend API (Fastify 5 + Drizzle/Postgres 16, TypeScript). Invites, permissions, sticker upload, versioned catalog publishing to Cloudflare R2. |
| `admin/` | Admin panel (React + Vite). Where the owner and managers upload stickers and publish the catalog. |
| `infra/` | Production: Docker Compose, Caddy, backup scripts. Ops runbook in `docs/OPERACAO.md` (pt-BR). |

Specs live in `docs/superpowers/specs/`: `2026-07-17-figurinhas-stories-design.md` (iOS MVP; read §5b before touching the Instagram flow) and `2026-07-18-infoproduto-p1-backend-admin-design.md` (backend/panel; also describes future sub-projects P2 remote catalog in app, P3 IAP monetization, P4 Explore tab). Execution ledger: `.superpowers/sdd/progress.md`.

Internal iOS names are still `Figurinhas` (target, scheme, `Figurinhas.xcodeproj`) while the product is "Body Creator" — deliberate, not drift.

## Cross-cutting invariants (break these and the product breaks)

- **Sticker PNG bytes are never re-encoded, anywhere.** Alpha/transparency is the entire product. iOS: `UIImage(data:)` validates only. Server: `sharp` reads metadata only; the original buffer goes to R2 untouched.
- **Sticker `id` is globally unique**, not per pack. iOS favorites store bare ids (`favoriteStickerIDs` in UserDefaults); the server enforces uniqueness with a DB primary key on `stickers.id` (text).
- **The published manifest must decode with `Catalog/Models.swift`.** Same shape as `Content/manifest.json`. `StickerPack.cover` is a **non-optional** `String` — a `null` cover breaks the whole catalog decode, which is why `buildManifest` filters packs without cover and the publish route refuses them.
- **`catalog/v{N}.json` is immutable; `catalog/current.json` is the mutable pointer.** Rollback = move the pointer. Cache rule lives in `isMutablePointer()` (`server/src/storage/r2.ts`): pointer gets 60s, everything else immutable/1y. New object keys must respect this split.
- All user-facing text in **pt-BR** (app, API errors, panel, ops docs). Code identifiers in English.
- No secrets in the repo — env vars only, validated at startup (`server/src/config.ts` fails the boot if one is missing).

## Server (`server/`)

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # dev DB :54320, test DB :55432 (tmpfs)
cd server
npm test              # 170 tests; integration tests need the :55432 container
npm test -- invites   # filter by file name
npm run dev           # tsx watch, http://localhost:3000
npm run db:generate   # after editing src/db/schema.ts — then inspect the SQL in drizzle/
npm run seed:admin    # reads ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD from env; idempotent, never overwrites an existing admin's password
```

Beware: a Homebrew Postgres on the host can shadow a dev container on :5432 (hence the 54320 mapping); the test container on :55432 is unaffected.

### Architecture

`buildApp(deps)` in `src/app.ts` is a factory that never calls `listen()` — tests inject `AppDeps = { config, db, mailer, storage }` with `createFakeMailer()` and `createMemoryStorage()`. Adding a dependency to `AppDeps` means updating every `buildApp` call in tests.

Auth: signed cookie carries only the userId; **the user is re-read from the DB on every request** (`requireAuth`), so disabling an account takes effect on the next request. There is deliberately no session table. `mustChangePassword` is enforced server-side in `requireAuth` (allowlist: `/auth/me`, `/auth/change-password`, `/auth/logout`).

Permissions: `role` (`admin` | `gerente`) + explicit permission list. `canDo()` (`src/auth/permissions.ts`) refuses `user.manage` for gerente **even if the string is in the DB** — defense at read time. `pack.price` and `report.view` exist but are inert until P3. No public signup: invite-only (32-byte token, stored hashed, single-use, 7 days).

Audit: `recordAudit()` recursively strips password/token fields from payloads before writing.

### Test conventions

- Every protected route gets negative-path tests: **403 (logged in, missing permission) and 401 (no session) are distinct cases**.
- Helpers in `tests/setup/app.ts` (`criarELogar`, `criarPackComCategoria`, `criarPackPublicavel`) and `tests/setup/db.ts` (`withTestDb` — migrates once, truncates between cases). Reuse them.
- Nothing talks to real R2 or sends real e-mail — thin `Storage`/`Mailer` interfaces with in-memory fakes; the real implementations are verified manually in staging.

## Admin panel (`admin/`)

```bash
cd admin && npm run dev    # :5173, expects API on :3000
npm run build              # VITE_API_URL=/api in production builds (Caddy serves both on one domain)
```

- All HTTP goes through `apiFetch` (`src/api.ts`) — it embeds `credentials: 'include'` and surfaces the server's pt-BR `{ error }` message. Never call `fetch` directly; show the server's message instead of a generic one.
- `can()` in `src/auth.tsx` only hides useless controls. **Authorization is the server's** — every hidden control must map to a route the server actually refuses.
- No `localStorage` for anything auth-related; the session cookie is httpOnly.

## Infra (`infra/`)

- Panel and API share one domain; Caddy strips `/api` before proxying. This keeps the session cookie same-site — don't split into two domains.
- Deploy order is fixed: `pull` → migrate → `up -d`. Migrating after the new API is up creates a window of new code against old schema.
- `backup.sh` / `restore-check.sh` run on the VPS (GNU tools, not macOS). The restore check actually restores into a disposable container and counts tables **and** users — keep both checks.
- Fastify runs with `trustProxy: true` because it is only reachable through Caddy (no published ports on the api container). Login rate limit is per-IP *and* per-email (in-memory map, resets on restart — by design).

## iOS app

### Generated files — never edit by hand

`project.yml` (XcodeGen) is the single source of truth. Both are generated and gitignored: `Figurinhas.xcodeproj` and `App/Info.plist` (hand edits are silently discarded; change `targets.Figurinhas.info.properties` in `project.yml`). **Run `xcodegen generate` after any `project.yml` change and after adding any file** — sources are static lists.

### Commands

```bash
xcodegen generate
DEST="platform=iOS Simulator,name=iPhone 17 Pro"
xcodebuild test  -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST"
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" \
  -only-testing:FigurinhasTests/CatalogStoreTests/testSearchIgnoresCaseAndAccents
python3 Scripts/validate_content.py Content     # same check the build runs (server port: src/content/validatePng.ts)
swift Scripts/generate_placeholders.swift Content
```

`-quiet` suppresses the `** TEST SUCCEEDED **` banner on this toolchain — judge by exit code, or drop the flag.

### Architecture

Four modules, one-way dependencies: **UI → {Catalog, Favorites, Export}**. `CatalogStore` is the only thing that knows where content comes from — the P2 bundle→server swap happens there alone. It drops stickers with missing files and prunes empty categories (the server-side `buildManifest` mirrors this pruning at the source).

`Content/` is bundle content: `manifest.json` + PNG folders, validated by a **pre-build phase that fails the build** on: missing file, duplicate id, PNG without alpha, >2 MB, longest side outside 512–2048 px. The server upload enforces the identical rules.

### Instagram integration (the core mechanic)

`shareToInstagramStories` puts `com.instagram.sharedSticker.backgroundImage` (photo, JPEG) + `com.instagram.sharedSticker.stickerImage` (sticker PNG) on the pasteboard, then opens `instagram-stories://share?source_application=<FacebookAppID>`.

- **Facebook App ID is mandatory** (Meta, since Jan 2023) — `Export/InstagramSharing.swift`. The App ID is public by design; the App Secret never enters the repo.
- The API **always creates a new story**; nothing can inject a sticker into a composition already open in Instagram. "Só copiar a figurinha" + long-press paste is the deliberate answer, and the only route for multiple stickers.
- Check `AVCaptureDevice.authorizationStatus` **before** presenting `CameraPicker` — `UIImagePickerController` renders black when denied instead of failing.

### iOS conventions

- iOS 16.0 floor — no iOS 17+ API (`ContentUnavailableView`, two-parameter `onChange`). Apple frameworks only.
- UI elements the end-to-end test drives carry `accessibilityIdentifier`s (`sticker-<id>`, `take-photo`, `copy-only`, …) — keep in sync with `UITests/BodyCreatorUITests.swift`. SwiftUI `confirmationDialog` cancel is invisible to XCUITest.
- The app collects no data ("Data Not Collected" label, `App/PrivacyInfo.xcprivacy` CA92.1) — keep that true as code changes; P3 (IAP) is when this gets revisited.
