/**
 * Public, shareable base URL for Sovereign.
 * Priority:
 *   1. VITE_APP_BASE_URL — explicit build/deploy-time override (custom domain)
 *   2. window.location.origin — the actual domain the app is running on.
 */

function envBaseUrl(): string | null {
  const raw = (import.meta as any)?.env?.VITE_APP_BASE_URL;
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) {
    return raw.trim().replace(/\/$/, '');
  }
  return null;
}

export function getPublicAppUrl(): string {
  const override = envBaseUrl();
  if (override) return override;

  if (typeof window === 'undefined') return '';

  // In browser, always return a valid origin (including localhost for dev).
  // This ensures buildShareLink produces absolute URLs even in local development.
  return window.location.origin;
}

/**
 * Returns the public origin (protocol + host + port) without any path.
 * Uses VITE_APP_BASE_URL when available, otherwise derives from window.location.
 * Safe fallback for SSR and edge cases.
 */
export function getPublicAppOrigin(): string {
  const override = envBaseUrl();
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      // fall through to window.location.origin
    }
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // SSR fallback — empty string indicates no public origin available.
  return '';
}

/** Build a full shareable link to an in-app path (path must start with "/"). */
export function buildShareLink(path: string): string {
  const publicUrl = getPublicAppUrl().replace(/\/$/, '');
  const basePath = (import.meta as any)?.env?.BASE_URL ?? '/';
  const normalizedBasePath = basePath.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;

  // Prevent duplication: if publicUrl already ends with the base path (case-insensitive),
  // do not append it again. This handles cases where VITE_APP_BASE_URL already includes
  // the deployment subpath (e.g. https://app.example.com/sovereign).
  const publicUrlLower = publicUrl.toLowerCase();
  const basePathLower = normalizedBasePath.toLowerCase();
  const hasBasePathSuffix = basePathLower !== '' && publicUrlLower.endsWith(basePathLower);

  const combinedPath = hasBasePathSuffix ? p : (normalizedBasePath ? `${normalizedBasePath}${p}` : p);
  return publicUrl ? `${publicUrl}${combinedPath}` : combinedPath;
}
