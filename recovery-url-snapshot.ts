// Captures the URL recovery state at the EARLIEST possible moment in the
// module graph, BEFORE Supabase JS's `createClient` (in `./auth`) runs
// `_initialize()` and consumes the hash.
//
// IMPORTANT: even though this module is imported in `index.tsx` BEFORE
// `./auth`, in practice Supabase JS's GoTrueClient kicks off
// `_initialize()` from inside its constructor as a fire-and-forget
// microtask, and synchronous top-level code in this file can still
// observe an already-cleared `window.location.hash` (the bundler
// hoists/orders things in ways that don't match the source-level
// import order).
//
// To make the read truly race-proof, the URL is captured by an inline
// `<script>` tag in `index.html` that runs BEFORE the JS bundle is
// fetched, and stashed onto `window.__GEOGLOWS_INITIAL_URL__`. We read
// from there here, falling back to `window.location.*` only if the
// inline snapshot is missing (e.g., during tests or in unexpected
// loading environments).
//
// Per plan 2026-04-30-003 — Unit 5 + B1 fix iteration. Originally
// added an in-module snapshot; promoted to an inline-script snapshot
// after diagnostics confirmed the in-module read still raced.

import { detectRecoveryUrlState, type RecoveryUrlState } from "@aquaveo/geoglows-auth/core";

interface InitialUrl {
  hash: string;
  search: string;
}

declare global {
  interface Window {
    __GEOGLOWS_INITIAL_URL__?: InitialUrl;
  }
}

function readInitialUrl(): InitialUrl {
  if (typeof window === "undefined") return { hash: "", search: "" };
  const inline = window.__GEOGLOWS_INITIAL_URL__;
  if (inline && typeof inline.hash === "string" && typeof inline.search === "string") {
    return { hash: inline.hash, search: inline.search };
  }
  return { hash: window.location.hash, search: window.location.search };
}

export const initialRecoveryUrlState: RecoveryUrlState =
  typeof window === "undefined"
    ? { kind: "none" }
    : detectRecoveryUrlState(readInitialUrl());

// TEMP DIAGNOSTIC: expose snapshot result for in-browser inspection.
// Lets the user run `window.__GEOGLOWS_RECOVERY_STATE__` in the console
// to verify what kind the detector resolved to. Remove once the
// recovery-flow regression is closed.
if (typeof window !== "undefined") {
  (window as unknown as { __GEOGLOWS_RECOVERY_STATE__?: RecoveryUrlState }).__GEOGLOWS_RECOVERY_STATE__ = initialRecoveryUrlState;
  // eslint-disable-next-line no-console
  console.log("[geoglows] initialRecoveryUrlState:", initialRecoveryUrlState);
}

if (initialRecoveryUrlState.kind === "pkce-unsupported") {
  console.error(
    "PKCE recovery flow is not supported in @aquaveo/geoglows-auth 1.3.x. " +
      "If your Supabase project has been migrated to PKCE, the recovery " +
      "URL template needs to use the implicit flow.",
  );
}
