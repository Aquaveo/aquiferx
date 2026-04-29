/**
 * Resolve a path relative to the app's base URL.
 * Vite sets BASE_URL to "/" in dev and "/aquifer-analyst/" in production.
 */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.startsWith('/') ? path.slice(1) : path}`;
}
