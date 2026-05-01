import {
  createGeoglowsSupabaseClient,
  createSupabaseAuthAdapter,
} from '@aquaveo/geoglows-auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `aquiferx: missing required environment variable(s): ${missing}. ` +
      `Set them in .env.local for local dev, or in the Vercel dashboard ` +
      `for Production / Preview / Development environments.`,
  );
}

export const supabase = createGeoglowsSupabaseClient({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_KEY,
});

// defaultRedirectTo is the fallback `redirectTo` for password-recovery,
// magic-link, OAuth, and email-confirmation flows. It MUST preserve the
// pathname so users accessed via the portal proxy
// (e.g. https://portal-dev.geoglows.org/aquifer-analyst) return to the
// same proxy path — using `window.location.origin` alone strips the
// pathname, which would land users on the portal root instead of back
// inside aquiferx.
//
// Hash and search are stripped to avoid replaying recovery tokens or
// stale query state when the user clicks the recovery email link.
//
// Operational requirement: every host+path that should be a valid
// redirect target must match a Supabase project's Auth → URL
// Configuration → Redirect URLs allowlist entry (production domain,
// Vercel preview pattern, localhost for dev). The existing
// `https://portal-dev.geoglows.org/**` entry covers
// `/aquifer-analyst`, `/grace-groundwater`, and `/hydroviewer`.
function currentLocationWithoutHashOrSearch(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.origin + window.location.pathname;
}

export const auth = createSupabaseAuthAdapter({
  supabase,
  defaultRedirectTo: currentLocationWithoutHashOrSearch(),
});
