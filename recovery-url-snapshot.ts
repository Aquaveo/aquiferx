// Captures the URL recovery state at the EARLIEST possible moment in the
// module graph, BEFORE Supabase JS's `createClient` (in `./auth`) runs
// `_initialize()` and consumes the hash.
//
// Imported by `index.tsx` BEFORE `./auth`, so the import-resolution order
// guarantees this module's top-level code executes first. Once Supabase JS
// has consumed `#access_token=…&type=recovery`, the hash is gone — relying
// on `window.location.hash` from inside `App.tsx` (which imports `./auth`)
// is too late.
//
// Per plan 2026-04-30-003 — Unit 5 + B1 fix iteration after first smoke
// showed the original module-load detector inside App.tsx ran AFTER
// Supabase consumed the hash.

import { detectRecoveryUrlState, type RecoveryUrlState } from "@aquaveo/geoglows-auth/core";

// Capture URL state BEFORE Supabase JS consumes the hash via
// detectSessionInUrl. Crucially, do NOT strip the hash here — Supabase
// needs to read it to establish the recovery session. The hash gets
// cleaned by Supabase as part of consumption (and we re-strip leftover
// fragments inside App.tsx's onAuthStateChange handler, mirroring the
// pattern apps.geoglows uses for INITIAL_SESSION).
export const initialRecoveryUrlState: RecoveryUrlState =
  typeof window === "undefined"
    ? { kind: "none" }
    : detectRecoveryUrlState({
        hash: window.location.hash,
        search: window.location.search,
      });

if (initialRecoveryUrlState.kind === "pkce-unsupported") {
  console.error(
    "PKCE recovery flow is not supported in @aquaveo/geoglows-auth 1.3.x. " +
      "If your Supabase project has been migrated to PKCE, the recovery " +
      "URL template needs to use the implicit flow.",
  );
}
