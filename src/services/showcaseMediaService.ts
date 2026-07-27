export async function getConfiguredWuhanMediaId(
  validIds: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await fetcher(apiUrl('/api/showcase/wuhan'), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { imageId?: unknown };
    const imageId = typeof payload.imageId === 'string' ? payload.imageId : '';
    return validIds.includes(imageId) ? imageId : undefined;
  } catch {
    return undefined;
  }
}

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  return `${base}${path}`;
}
