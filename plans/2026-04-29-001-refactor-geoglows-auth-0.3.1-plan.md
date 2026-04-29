---
title: Align aquiferx with @aquaveo/geoglows-auth@0.3.1 (drop Cognito, drop org UI)
type: refactor
status: active
date: 2026-04-29
---

# Align `aquiferx` with `@aquaveo/geoglows-auth@0.3.1`

## Overview

`aquiferx` currently consumes `@aquaveo/geoglows-auth@^0.1.2`, which still
shipped the AWS Cognito OIDC adapter and the organization-based UI surface
(`<SidebarUserMenu variant='light'>`, `<SidebarOrgBadge>`). Both `0.2.0`
(Cognito-or-Supabase) and `0.3.0` (org concept removed, rich profiles added)
are skipped — this plan upgrades directly to `0.3.1`.

After the upgrade, `aquiferx`:

- Authenticates against Supabase Auth only (no Cognito).
- Renders the lib's React surface for sign-in (`<SupabaseAuthUI>`) and the
  user menu (`<UserMenu>`).
- Has no organization concept anywhere in code — neither in the UI nor in
  data models.

The work is intentionally **compatibility-only**: bump the dep, replace the
removed APIs with their 0.3.1 equivalents, drop Cognito infra. Adopting
the rich-profile editor (`<ProfileEditForm>`, etc.) and adding test infra
are deliberately deferred (see Scope Boundaries).

**Merge note (2026-04-29):** `origin/main` was merged into `implementing-auth`
(merge commit `3270362`) to bring in 25+ commits of pre-existing aquiferx
work (WQP integration, catalog system, doc rewrites, imputation/raster
improvements). Five conflicts were resolved across `App.tsx`,
`components/import/DataTypeEditor.tsx`, and `components/import/ImportDataHub.tsx`
— the resolutions kept this plan's auth additions and took main's cleaner
versions for the duplicated `delete-folder` fetch and the `fetchRegionList`
signature. The merge auto-resolved one prior code-review finding (Finding #5
of v1: `appUrl('/api/regions')` bypassing the Vercel rewrite) for that
specific callsite by adopting main's raw `fetch('/api/regions')`.

## Problem Frame

The library jump from `0.1.2` → `0.3.1` mixes one *forced* change and one
*voluntary* change for `aquiferx`:

- **Forced (org UI removed in 0.3.0)**: the lib no longer exports
  `<SidebarUserMenu>`, `<SidebarOrgBadge>`, `<OrgSelector>`,
  `<OrgSettings>`, `useOrg`, the `Organization`/`OrgMembership` types,
  or the helpers `loadOrganizations` / `createOrganization` /
  `selectActiveOrg`. `AccountSummary` shrunk to `{ profile }`. New
  rich-profile React components were added
  (`<ProfileSetupForm>`, `<ProfileEditForm>`,
  `<ProfileCompletionBanner>`, `<SupabaseAuthUI>`). Aquiferx imports
  two of the removed components (`<SidebarUserMenu>`,
  `<SidebarOrgBadge>`), so the dep bump alone breaks compilation in
  those files.
- **Voluntary (consolidate on Supabase Auth)**: the library is
  *dual-mode by design* — both `createOidcAuthAdapter` (Cognito) and
  `createSupabaseAuthAdapter` (Supabase Auth) remain exported in
  0.3.1. The `useIdToken` option on `createGeoglowsSupabaseClient` is
  also still there (and defaults to `true`). So aquiferx **could**
  bump to 0.3.1 while keeping its current Cognito-based `auth.ts`
  intact — there is no compile-break on the auth-adapter side.
  However, the strategic direction is consolidation on Supabase Auth
  (set by `apps.geoglows`), and the bump is a natural moment to
  execute that migration. This plan bundles both into one PR.

Today, on `0.1.2`, the moment the dep is bumped to `^0.3.1`:

- `App.tsx:1288` imports `SidebarUserMenu` (removed in 0.3.0) — **build breaks**.
- `components/Sidebar.tsx:5` imports `SidebarOrgBadge` (removed in 0.3.0) — **build breaks**.
- `auth.ts` imports `createOidcAuthAdapter` (still exported) — keeps working.
- `auth.ts:14` passes `useIdToken: true` (still accepted) — keeps working.

So the *minimum* compile-fix scope is just the two org-UI cleanups
(Units 3 and 4 below). The Cognito → Supabase Auth migration (Units 2,
5, 6) is voluntary work bundled into the same PR for strategic
alignment, not because the dep bump forces it. If timing or risk
demands a split, the org-UI pieces can land first as a 1-PR bump,
followed by a separate 1-PR auth migration. Default in this plan: both
in one PR (smaller surface for review, single env-var rollout, single
manual smoke pass).

The strategic alignment was already made in `apps.geoglows` (see
`apps.geoglows/docs/plans/2026-04-28-002-refactor-cognito-to-supabase-auth-plan.md`):
GEOGloWS consolidates on Supabase as the single identity provider.
`aquiferx` is the second consumer, currently the holdout, and the only
remaining blocker to fully decommissioning Cognito.

`<AuthProvider>` in 0.3.1 auto-bootstraps the session inside its
`useEffect` (calls `completeSignInIfNeeded`, `getCurrentUser`,
`ensureProfile`). `aquiferx` does not need to manually call
`bootstrapSession` — wrapping `<App>` in `<SupabaseProvider>` +
`<AuthProvider>` is sufficient.

## Requirements Trace

- **R1.** `npm run build` succeeds against `@aquaveo/geoglows-auth@0.3.1`.
- **R2.** A user can sign up, sign in, and sign out using Supabase Auth
  (email/password and the OAuth providers already enabled at the Supabase
  project level: Google, GitHub).
- **R3.** No code references to `createOidcAuthAdapter`,
  `<SidebarUserMenu>`, `<SidebarOrgBadge>`, `useOrg`, `Organization`, or
  `useIdToken` survive the change.
- **R4.** Cognito environment variables (`VITE_COGNITO_*`) are removed from
  `.env.local` and from any documentation. Aquiferx's Vercel project
  (production + previews), if deployed, is updated in lockstep.
- **R5.** When the user is signed out, the app renders a sign-in entry
  point that opens `<SupabaseAuthUI>`. When signed in, the app renders
  the user menu without a visible regression in the navbar layout.
- **R6.** No regression in non-auth functionality: map view, region/aquifer
  loading, data import wizards, charts, and the existing data flows
  continue to work.

## Scope Boundaries

- **No production user-data migration.** Assumed fresh-start posture
  (see Open Questions → Resolved). If real users exist on aquiferx
  keyed on Cognito subs, that triggers a separate migration plan.
- **No new feature work.** Profile editing, completion banners,
  rich-profile fields visible in aquiferx UI are *not* part of this plan.
- **No data model changes.** The `aquifer` schema (regions, aquifers,
  wells, measurements) is untouched. RLS policies on the shared
  `public.profiles` are managed by apps.geoglows's migrations and are
  out of scope here.
- **No changes to the long-term `plan_user_strategy.md` direction.** That
  doc's organization/admin/viewer model remains aspirational; this plan
  unblocks the dep bump without committing to or against that direction.
- **No styling rework.** The 0.1.2 `<SidebarUserMenu variant='light'>`
  prop is gone; the new `<UserMenu>` takes no props. Visual fidelity is
  acceptable to lose; bespoke restyling is a follow-up.

### Deferred to Separate Tasks

- **Test infrastructure** (vitest + jsdom + tests for the auth integration):
  follow the apps.geoglows pattern landed in `apps.geoglows#6`. Worth a
  separate plan once the compatibility cutover is stable.
- **Cognito infrastructure decommissioning** (delete the Cognito User
  Pool, app clients, and remove from cloud cost): scheduled for ~30 days
  post-cutover per the apps.geoglows decommission timeline.
- **Profile UI** (using `<ProfileEditForm>` / `<ProfileCompletionBanner>`):
  separate plan once the team decides whether aquiferx needs a profile
  page distinct from the apps.geoglows portal's.
- **Rebuilding the org concept** (admin/viewer roles, shared org data):
  the `plan_user_strategy.md` aspiration. Will need its own brainstorm
  + plan once the team decides whether to layer it on top of Supabase
  or use a different model.

## Context & Research

### Relevant Code and Patterns

- `auth.ts` — current Cognito adapter setup (entire file rewritten).
- `index.tsx` — current React provider tree (provider names unchanged
  in 0.3.1, just the adapter constructor changes).
- `App.tsx:1288` — single `<SidebarUserMenu>` usage; replace with
  `<UserMenu />` plus a sign-in fallback.
- `components/Sidebar.tsx:5,1059` — single `<SidebarOrgBadge>` usage;
  remove entirely.
- `apps.geoglows/src/auth.js` — Supabase Auth wrapper pattern (vanilla
  JS equivalent). Mirror the `signInRedirect` / `signOutRedirect`
  semantics; in React, lean on `<AuthProvider>`'s built-in `signIn`/
  `signOut` exposed via `useAuth()`.
- `apps.geoglows/src/ui/signInModal.js` — vanilla JS sign-in modal that
  documents the OAuth + email/password + sign-up flow. The React
  equivalent is `<SupabaseAuthUI>` exported from
  `@aquaveo/geoglows-auth/react`; do not re-build this in aquiferx.
- `apps.geoglows/docs/plans/2026-04-28-002-refactor-cognito-to-supabase-auth-plan.md`
  — direct precedent. Mirror its sequencing (RLS / Supabase project
  changes already done; aquiferx work is purely consumer-side).

### Institutional Learnings

- **From apps.geoglows#3 (Cognito → Supabase migration)**: OAuth callback
  hash is processed by Supabase JS only when `INITIAL_SESSION` fires.
  In React, `<AuthProvider>` handles this internally — but a sibling
  listener on `supabase.auth.onAuthStateChange` is needed if the app
  wants to react to OAuth completions outside the provider's refresh
  cycle. Probably not needed here; flag for execution-time discovery.
- **From apps.geoglows#3 (Vercel preview env vars)**: `VITE_SUPABASE_*`
  env vars must be set per-environment (Production / Preview / Development)
  on Vercel. Setting only Production silently breaks preview deploys.
- **From geoglows-auth#3 (`ensureProfile` no-overwrite, 0.3.1)**:
  user-edited profile fields survive sign-out/sign-in. Nothing to do in
  aquiferx beyond bumping to 0.3.1; the fix lives in the lib.

### External References

None needed — the lib is in-house and the strategic decisions are settled
by the apps.geoglows precedent.

## Key Technical Decisions

- **Use `<SupabaseAuthUI>` from the lib's React surface for sign-in.**
  Rationale: aquiferx is React; the apps.geoglows portal had to build a
  vanilla JS modal because it isn't React. We get the form, OAuth
  buttons, magic-link, and password sign-up for free.
- **Use `<UserMenu />` (no props) as the navbar avatar replacement.**
  Rationale: drop-in functional equivalent. The lost `variant='light'`
  prop is a styling concern only; defer custom styling. If the visual
  is unacceptable, build a tiny menu locally using `useAuth()` —
  flagged as a follow-up, not blocking the cutover.
- **Mount `<SupabaseAuthUI>` in a modal-style wrapper toggled by a
  navbar "Sign in" button.** Rationale: matches the apps.geoglows UX
  pattern (modal opened on demand). Alternative — gating the entire app
  behind a sign-in page — is rejected: aquiferx is a regional-data
  visualization tool that should be browsable as a guest, with sign-in
  required only for personalized features.
- **Drop `oidc-client-ts` from direct dependencies.** Rationale: it was
  the runtime for the Cognito adapter only. The library no longer pulls
  it transitively (Supabase Auth doesn't use it). Keeping it would be
  dead weight.
- **Drop `useIdToken: true` from `createGeoglowsSupabaseClient`.**
  Rationale: that flag tells the client to forward the Cognito ID token
  in PostgREST requests so RLS can read claims off it. Once aquiferx
  switches its `auth` adapter to `createSupabaseAuthAdapter`, the flag
  is irrelevant — the Supabase Auth adapter doesn't produce an
  `id_token` to forward, and Supabase Auth-issued requests use the
  native `Authorization: Bearer <access_token>` per request with RLS
  reading `auth.uid()`. The flag still exists in the library (defaults
  to `true`) but ceases to do anything meaningful for a Supabase-Auth
  consumer; remove it to keep the call site honest.
- **Wrap `<App>` exactly the way 0.1.2 does — `<SupabaseProvider>`
  outside `<AuthProvider>`.** Rationale: the type signatures and runtime
  behavior of these two components are unchanged across the 0.1.2 →
  0.3.1 jump. Only the constructor passed to `auth` (the adapter) has
  changed.

## Open Questions

### Resolved During Planning

- **Q: Are there real production users keyed on Cognito subs in the
  `profiles` table that aquiferx needs to migrate?**
  Resolution: assumed **no**, mirroring the apps.geoglows fresh-start
  decision ("only test data, safe to drop"). Aquiferx today persists
  no user-keyed data of its own — `public/data/` is shared static
  files; there is no aquiferx-side `auth.users` ↔ data join. If this
  assumption is wrong, raise it before execution and we open a
  separate migration plan.

- **Q: Should aquiferx render `<ProfileCompletionBanner>` or
  `<ProfileEditForm>` after the cutover?**
  Resolution: no — out of scope. The compatibility cutover should not
  add new UX. Tracked in `### Deferred to Separate Tasks`.

- **Q: Does `<AuthProvider>` in 0.3.1 still auto-bootstrap the session
  or does the consumer need to call `bootstrapSession` manually?**
  Resolution: auto-bootstraps. Verified against the published
  `dist/react.js` — its `useEffect` calls `clearStaleAuthState`,
  `setupTokenRenewal`, `completeSignInIfNeeded`, `getCurrentUser`, and
  `ensureProfile` on mount. No consumer-side bootstrap needed.

- **Q: Does the new lib still expose `useAuth()` and is its return shape
  the same?**
  Resolution: yes. `useAuth()` returns `{ user, profile, loading,
  refresh, signIn, signOut }` in 0.3.1, same shape as 0.1.2 (minus the
  org-related fields, which were never used in aquiferx). Custom code
  using `useAuth()` to gate UI works without changes.

- **Q: Where do we host the new sign-in UI in the layout?**
  Resolution: a navbar "Sign in" button in `App.tsx`, opening a modal
  containing `<SupabaseAuthUI>`. When `useAuth().user` is non-null,
  render `<UserMenu />` in the same slot.

### Deferred to Implementation

- **Visual styling of the navbar after the swap.** The lib's default
  `<UserMenu>` may not match aquiferx's existing color palette. If the
  contrast is unacceptable, build a tiny local menu using `useAuth()`
  and `lucide-react` icons. Defer the decision to when we can see the
  rendered output.
- **Modal mechanics for `<SupabaseAuthUI>`.** Native `<dialog>` with
  Tailwind centering (apps.geoglows pattern) vs. an inline `<div>` with
  fixed positioning. Aquiferx already uses Tailwind so either works;
  pick at implementation time based on the surrounding sidebar/map
  layout.
- **Whether to add `redirectTo` to OAuth flows.** Aquiferx may live at a
  subpath that affects Supabase OAuth redirect URLs. Resolve when
  testing live OAuth.

## Implementation Units

- [x] **Unit 1: Bump `@aquaveo/geoglows-auth` to `^0.3.1` and prune Cognito-only deps**

**Goal:** Move the manifest to the new lib version and remove
no-longer-needed transitive deps so the build can fail loudly on the
removed APIs (which Units 2-5 then fix).

**Requirements:** R1, R3

**Dependencies:** None.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Approach:**
- `npm install @aquaveo/geoglows-auth@^0.3.1` to update both manifests.
- `npm uninstall oidc-client-ts` — direct dep, only used by the Cognito
  adapter. The new lib doesn't pull it transitively. Verify with
  `npm ls oidc-client-ts` after; if a transitive consumer turns up,
  leave it untouched.
- Do **not** run `npm run build` after this unit; the build is expected
  to fail on the two org-UI imports (`SidebarUserMenu` and
  `SidebarOrgBadge` — both removed in lib 0.3.0). Those failures are
  the signal that Units 3 and 4 are needed. The Cognito-related
  imports (`createOidcAuthAdapter`, `useIdToken: true`) still resolve
  in 0.3.1 — Units 2 and 5 are voluntary cleanup, not compile fixes.

**Patterns to follow:**
- `apps.geoglows/package.json` change in PR #4 (chore(deps) commit).

**Test scenarios:**
- Test expectation: none — pure dep manifest change. Real verification
  is the build failure that the next units fix.

**Verification:**
- `package.json` shows `@aquaveo/geoglows-auth: ^0.3.1`.
- `oidc-client-ts` is absent from `dependencies` and `devDependencies`.
- `package-lock.json` resolves `geoglows-auth-0.3.1.tgz` for the
  `node_modules/@aquaveo/geoglows-auth` entry.

---

- [x] **Unit 2: Rewrite `auth.ts` to use the Supabase Auth adapter**

**Goal:** Replace the Cognito OIDC adapter with `createSupabaseAuthAdapter`
so the rest of the app gets a working `AuthAdapter` and the typed
`supabase` client.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 1.

**Files:**
- Modify: `auth.ts`

**Approach:**
- Replace the `createOidcAuthAdapter({...Cognito...})` construction with
  `createSupabaseAuthAdapter({ supabase })`. Note the order: the supabase
  client is constructed first, then the adapter is built around it.
- Drop the `auth: useIdToken: true` block on `createGeoglowsSupabaseClient`.
  The new signature does not accept either argument.
- Re-export both `auth` and `supabase` (same names as today) so
  `index.tsx` import sites don't change.

**Patterns to follow:**
- `apps.geoglows/src/auth.js` — vanilla JS but the same shape: build
  the supabase client, wrap it with `createSupabaseAuthAdapter`, export
  named symbols.
- `apps.geoglows/src/supabase.js` — single client construction pattern.

**Test scenarios:**
- Test expectation: none — covered by the smoke test in Unit 7.

**Verification:**
- `auth.ts` no longer imports `createOidcAuthAdapter`.
- `auth.ts` no longer references `import.meta.env.VITE_COGNITO_*`.
- `npx tsc --noEmit` passes against `auth.ts` in isolation (the rest of
  the tree may still fail until Units 3-5 land).

---

- [x] **Unit 3: Replace `<SidebarUserMenu>` and add a sign-in modal trigger in `App.tsx`**

**Goal:** Restore the navbar identity surface using the lib's 0.3.1 React
exports — `<UserMenu>` for the signed-in case, a "Sign in" button +
`<SupabaseAuthUI>`-in-a-modal for the signed-out case.

**Requirements:** R2, R3, R5

**Dependencies:** Unit 2.

**Files:**
- Modify: `App.tsx` (only the navbar slot at and around line 1288).

**Approach:**
- Drop the `SidebarUserMenu` import; add `UserMenu`, `SupabaseAuthUI`,
  and `useAuth` imports from `@aquaveo/geoglows-auth/react`.
- At the existing `<SidebarUserMenu variant='light' />` site, render:
  - `useAuth().user` truthy → `<UserMenu />`.
  - `useAuth().user` null → a "Sign in" `<button>` that opens a modal
    containing `<SupabaseAuthUI adapter={auth} />`.
- Modal mechanics: prefer a native `<dialog>` with Tailwind centering
  classes (`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`)
  to match the apps.geoglows convention. Close on `Escape`, on
  backdrop click, and on `<SupabaseAuthUI>`'s `onSuccess`.
- The sign-in button should be a small, navbar-sized control — match the
  surrounding "Open Data Manager" button visually.
- Pass `auth` (imported from `./auth`) as the `adapter` prop. Optionally
  set `magicLinkRedirectTo={window.location.origin + window.location.pathname}`
  if magic-link is desired; if undecided, omit and use defaults.

**Patterns to follow:**
- `apps.geoglows/src/ui/signInModal.js` — modal-mechanics behavior:
  centered dialog, Escape-closes, sign-up support, error surfacing.
  We do not re-implement the form (the lib's `<SupabaseAuthUI>` does
  it); we mirror the modal *envelope*.

**Test scenarios:**
- Happy path (manual): not signed in → click "Sign in" → modal opens →
  fill email/password → submit → modal closes → `<UserMenu>` appears.
- Edge case (manual): not signed in → click "Sign in" → press Escape →
  modal closes; click "Sign in" again → modal reopens with cleared
  state.
- Integration (manual): not signed in → click Google in `<SupabaseAuthUI>`
  → browser redirects to Google → returns to aquiferx with `?code=&state=`
  → modal not visible (because `useAuth().user` is now truthy) →
  `<UserMenu>` rendered.

**Verification:**
- `App.tsx` no longer imports `SidebarUserMenu`.
- The navbar at line ~1288 renders `<UserMenu />` when signed in and a
  "Sign in" button when signed out.
- `<SupabaseAuthUI>` mounts inside a centered, dismissible modal.

---

- [x] **Unit 4: Remove `<SidebarOrgBadge>` from `Sidebar.tsx`**

**Goal:** Strip the org-badge import and render site so the sidebar
compiles against 0.3.1.

**Requirements:** R1, R3

**Dependencies:** Unit 1 (so the import can resolve to "not present" cleanly).

**Files:**
- Modify: `components/Sidebar.tsx`

**Approach:**
- Delete the `import { SidebarOrgBadge } from '@aquaveo/geoglows-auth/react';`
  line.
- Delete the `<SidebarOrgBadge />` render at line ~1059.
- Do **not** add a placeholder. The "Sync Active" status badge directly
  below it remains and is sufficient as the sidebar footer.

**Patterns to follow:**
- None — clean deletion.

**Test scenarios:**
- Test expectation: none — pure removal with no behavioral substitute.
  Visual check covered by Unit 7 smoke test.

**Verification:**
- `Sidebar.tsx` no longer references `SidebarOrgBadge`.
- The sidebar footer renders the "Sync Active" status block as its
  bottom-most element.

---

- [x] **Unit 5: Drop Cognito environment variables**

**Goal:** Remove `VITE_COGNITO_*` env vars from local config and
documentation; update the Vercel project (production + previews) in
the same window so deployed builds don't carry stale config.

**Requirements:** R3, R4

**Dependencies:** Unit 2 (so the code stops reading them).

**Files:**
- Modify: `.env.local` (remove the 6 `VITE_COGNITO_*` lines).
- Modify: `README.md` if it documents env setup (verify at execution).
- Modify: any `.env.example` if present (verify at execution; aquiferx
  may not have one).

**Approach:**
- Strip `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`,
  `VITE_COGNITO_REDIRECT_URI`, `VITE_COGNITO_LOGOUT_URI`,
  `VITE_COGNITO_SCOPE`, `VITE_COGNITO_DOMAIN` from `.env.local`.
- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set
  and point to the same Supabase project as `apps.geoglows`. (Different
  projects = different `auth.users` table = different sign-in surface.)
- Operational task — not a code change, executed by the developer
  during the cutover: remove the same 6 env vars from the Vercel
  project's Production, Preview, and Development environments. Add
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` if missing.

**Patterns to follow:**
- `apps.geoglows` did this same env cleanup as part of PR #2 (Cognito
  → Supabase). Vercel UI flow is identical.

**Test scenarios:**
- Test expectation: none — config-only.

**Verification:**
- `.env.local` contains no `VITE_COGNITO_*` lines.
- `npm run dev` starts without "missing required env var" warnings.
- README, if it mentioned Cognito setup, no longer does.
- Vercel environments (operational) reflect the same change.

---

- [x] **Unit 6: Verify `index.tsx` provider tree still compiles and re-bootstraps cleanly**

**Goal:** Confirm the existing `<SupabaseProvider><AuthProvider>` wrapping
in `index.tsx` works against 0.3.1 without modification, and decide on
the spot whether any adjustment is needed.

**Requirements:** R1, R2

**Dependencies:** Units 2, 3, 4.

**Files:**
- Modify (likely zero changes): `index.tsx`

**Approach:**
- Run `npm run dev`; load the app; observe whether `useAuth()` settles
  to `{ user, profile, loading: false }` for both signed-in and
  signed-out states.
- If the OAuth callback (after Google/GitHub sign-in) does not clear
  the URL hash on its own, port the small `INITIAL_SESSION` cleanup
  effect from `apps.geoglows/src/main.js` (the `hashHasAuth` /
  `queryHasAuth` block that calls `history.replaceState`). If
  `<AuthProvider>` already does this, no-op.

**Patterns to follow:**
- `apps.geoglows/src/main.js` lines wrapping the
  `supabase.auth.onAuthStateChange("INITIAL_SESSION", ...)` handler.

**Test scenarios:**
- Test expectation: none — verification is the manual smoke test in
  Unit 7.

**Verification:**
- `index.tsx` either compiles unchanged or with one small `useEffect`
  added at the top of `<App>` for OAuth-callback URL cleanup.
- After a Google sign-in round-trip, the address bar contains no
  `access_token=` or `?code=&state=` artifacts.

---

- [ ] **Unit 7: Smoke test the full sign-in / sign-out / sign-up loop**

**Goal:** Execution-time verification that the cutover is functionally
complete before the PR is merged.

**Requirements:** R1, R2, R5, R6

**Dependencies:** Units 1-6.

**Files:**
- None (verification only).

**Approach:**
- Run `npm run build`; require zero errors and zero TypeScript errors
  (`npx tsc --noEmit`).
- `npm run dev` and exercise:
  1. Anonymous browse: load the app, navigate the map, open an existing
     region, view measurements. **No regression in the data layer.**
  2. Email/password sign-up: click "Sign in" → toggle to "Create
     account" → submit. Confirmation email arrives; link click signs
     the user in.
  3. Email/password sign-in: existing user signs in, modal closes,
     `<UserMenu>` appears in the navbar.
  4. Google OAuth: click Google in `<SupabaseAuthUI>` → redirects to
     Google → returns to aquiferx → signed in.
  5. GitHub OAuth: same as #4.
  6. Sign-out: click `<UserMenu>` → sign out → `<UserMenu>` is
     replaced by the "Sign in" button.
  7. Profile row presence: in the Supabase SQL editor, run
     `select id, email, first_name, last_name from profiles where
     email = '<test user>';` — confirm a row exists for the new sign-up.
  8. Reload after sign-in: page reloads → `useAuth().user` settles
     truthy without the modal flashing open.

**Patterns to follow:**
- The same manual smoke checklist used to verify
  `apps.geoglows#3` after the Cognito→Supabase cutover.

**Test scenarios:**
- Listed in **Approach** — these are the actual smoke checks.

**Verification:**
- All 8 manual checks pass.
- `npm run build` clean.
- Existing data-explorer flow (region selection, time-series chart,
  measurement table) shows no regression.

## System-Wide Impact

- **Interaction graph:** the only entry points the lib reaches into are
  `<SupabaseProvider>` (the supabase client context),
  `<AuthProvider>` (auth state, auto-bootstrap, `useAuth()` hook),
  `<SupabaseAuthUI>` (sign-in form), and `<UserMenu>` (avatar /
  sign-out). No other surfaces are touched.
- **Error propagation:** sign-in errors flow through
  `<SupabaseAuthUI>`'s internal error display + the consumer-level
  `onError` callback (optional). Unhandled promise rejections from
  `<AuthProvider>`'s bootstrap effect log to `console.error` and
  resolve `loading` to `false` — same pattern as 0.1.2.
- **State lifecycle risks:** OAuth callback URL pollution if the
  consumer doesn't clean it up. Mitigated in Unit 6.
- **API surface parity:** the only authoritative API call path that
  changes is identity provisioning. Data calls
  (`supabase.from('regions').select(...)`, etc.) are unaffected — same
  client, same RLS policies, just a different `auth.uid()` source.
- **Integration coverage:** smoke tests in Unit 7. No automated test
  coverage is added in this plan (deferred — see Scope Boundaries).
- **Unchanged invariants:** the `aquifer` schema, all data services
  (`services/dataLoader.ts`, `services/usgsApi.ts`,
  `services/reprojection.ts`), and all map / chart / import components
  remain functionally and contractually identical. This plan touches
  only the four files listed in Implementation Units 2-4, plus
  manifest and env config.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Existing aquiferx users have profile rows keyed on Cognito subs that won't match Supabase Auth UUIDs after cutover. | Resolved during planning as "no production users" (Open Questions). If wrong, halt before Unit 5 and open a separate migration plan. |
| `<UserMenu>`'s default styling visibly clashes with aquiferx's color palette. | Acceptable for v1 — matches the strategic "compatibility-only" posture. Custom restyling tracked as a follow-up. |
| Vercel preview deploys break because `VITE_SUPABASE_*` are set on Production only. | Unit 5 explicitly calls out the Preview / Development environments. Use `vercel env pull` to verify after the change. |
| OAuth redirect URLs (Google / GitHub apps registered with Supabase) don't include aquiferx's domain. | Operational task — verify at Unit 7 step 4-5. If broken, add the domain to the Supabase project's redirect-URL allowlist. Same pattern as apps.geoglows. |
| `<AuthProvider>` doesn't clean up OAuth callback URL hash and the user reloads to a stale `access_token=` re-trigger. | Unit 6 ports the apps.geoglows hash-cleanup effect if needed. Verified at Unit 7 step 8. |
| Cross-app SSO (apps.geoglows ↔ aquiferx) was broken during the transition window and remains broken until aquiferx ships this change. | Accepted. This plan *closes* that window. After merge, both apps share the same Supabase Auth and SSO works again. |

## Documentation / Operational Notes

- **README**: if the README's "Setup" or "Environment" section
  documents the Cognito vars, update to Supabase-only. Verify at
  execution.
- **Vercel env config**: operational change required in the project
  dashboard. See Unit 5.
- **Decommissioning the AWS Cognito User Pool** is *not* part of this
  plan. Aquiferx's cutover is the last consumer to leave Cognito; once
  this lands and bakes for ~30 days, the Cognito User Pool and its
  app clients can be deleted. Track separately.

## Sources & References

- **Precedent plan:** `apps.geoglows/docs/plans/2026-04-28-002-refactor-cognito-to-supabase-auth-plan.md`
- **Library 0.3.0 changelog (in commit body):** `geoglows-auth` commit
  `8eaa589 chore(release): bump to 0.3.0 with rich-profiles changelog`
- **Library 0.3.1 fix:** `geoglows-auth` PR #3 (`ensureProfile`
  no-overwrite).
- **`apps.geoglows` consuming PRs:** #4 (auth 0.3.1 + safe_auto fixes),
  #6 (test infra + MAINT-001).
- **Aquiferx user-strategy doc:** `plans/user_and_data_strategy.md`
  — describes the long-term org/admin/viewer aspiration; intentionally
  *not* implemented by this plan.
- **Aquiferx project guide:** `CLAUDE.md`.
