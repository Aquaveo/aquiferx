import {
  createGeoglowsSupabaseClient,
  createSupabaseAuthAdapter,
} from '@aquaveo/geoglows-auth';

export const supabase = createGeoglowsSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export const auth = createSupabaseAuthAdapter({ supabase });
