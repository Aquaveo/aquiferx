import { createOidcAuthAdapter, createGeoglowsSupabaseClient } from '@aquaveo/geoglows-auth';

export const auth = createOidcAuthAdapter({
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirectUri: import.meta.env.VITE_OIDC_REDIRECT_URI,
  logoutUri: import.meta.env.VITE_OIDC_LOGOUT_URI,
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN,
  scope: import.meta.env.VITE_OIDC_SCOPE || 'openid email profile',
});

export const supabase = createGeoglowsSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  auth,
  useIdToken: true,
});
