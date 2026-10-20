import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// loadEnv(mode, '.', '') also exposes process env, so CI-provided SHAs are visible here.
function resolveBuildSha(env: Record<string, string>) {
  const sha = env.BUILD_SHA || env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA || '';
  return sha.trim().slice(0, 64) || 'unknown';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const buildSha = resolveBuildSha(env);
  const builtAt = new Date().toISOString();

  return {
    // Pages and Sites builds pass --base explicitly; default to the root domain.
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      {
        name: 'chuyou-build-meta',
        transformIndexHtml: () => [
          { tag: 'meta', attrs: { name: 'chuyou-build-sha', content: buildSha }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'chuyou-built-at', content: builtAt }, injectTo: 'head' },
        ],
      },
    ],
    server: {
      // Same-origin /api in local dev goes to `npm run start:server` (127.0.0.1:8787).
      proxy: env.VITE_API_BASE_URL ? undefined : {
        '/api': { target: env.VITE_DEV_API_PROXY || 'http://127.0.0.1:8787', changeOrigin: true },
      },
    },
  };
});
