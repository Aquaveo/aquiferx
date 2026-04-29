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

// defaultRedirectTo is consumed by the Supabase Auth adapter as the
// fallback `emailRedirectTo` for magic-link flows (and other redirect
// surfaces). Anchoring it to window.location.origin at module-load time
// makes Vercel preview deploys, local dev, and production all redirect
// magic-link users back to the host they signed in from — instead of
// the project's Supabase Site URL, which is shared with apps.geoglows.
//
// Operational requirement: every host that should be a valid redirect
// target must also be in the Supabase project's Auth → URL Configuration
// → Redirect URLs allowlist (production domain, Vercel preview pattern,
// localhost for dev).
export const auth = createSupabaseAuthAdapter({
  supabase,
  defaultRedirectTo:
    typeof window !== 'undefined' ? window.location.origin : undefined,
});
