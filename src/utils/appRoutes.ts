/**
 * Utilitários de roteamento compatíveis tanto com raiz local ("/")
 * quanto com subdiretório no GitHub Pages ("/aether-live-avatar-studio/").
 */

export function getAppBasePath(): string {
  if (typeof window === 'undefined') return '/';
  let path = window.location.pathname || '/';
  // Remove /pacific-r (com ou sem subcaminho) ou /index.html do final
  path = path.replace(/\/pacific-r(?:\/.*)?$/i, '/');
  path = path.replace(/\/index\.html$/i, '/');
  if (!path.endsWith('/')) {
    path += '/';
  }
  return path;
}

export function isPacificRRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname || '';
  const hash = window.location.hash || '';
  const params = new URLSearchParams(window.location.search);
  return (
    /(^|\/)pacific-r(\/|$)/i.test(pathname) ||
    /^#\/?pacific-r(\/|\?|$)/i.test(hash) ||
    params.get('area') === 'pacific-r'
  );
}

export function getPacificRPath(): string {
  return `${getAppBasePath()}pacific-r`;
}

export function getPacificRFullUrl(): string {
  if (typeof window === 'undefined') return '/pacific-r';
  return `${window.location.origin}${getPacificRPath()}`;
}

export function resolvePublicAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return `${getAppBasePath()}${clean}`;
}
