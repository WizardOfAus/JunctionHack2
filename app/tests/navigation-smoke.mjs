import assert from 'node:assert/strict';
import { workspaceRoutes } from '../features/navigation/routes.ts';

// Run against a dedicated preview: BASE_URL=http://127.0.0.1:5177 node tests/navigation-smoke.mjs
const base = process.env.BASE_URL || 'http://127.0.0.1:5177';
const root = await fetch(base, { redirect: 'manual' });
assert.ok([307, 308].includes(root.status), `Root should redirect, got ${root.status}`);
assert.equal(new URL(root.headers.get('location'), base).pathname, '/money');
for (const { href, title } of Object.values(workspaceRoutes)) {
  const response = await fetch(new URL(href, base));
  assert.equal(response.status, 200, `Direct load ${href}`);
  const html = await response.text();
  assert.ok(html.includes(`<title>${title}</title>`), `Distinct title for ${href}`);
}
const missing = await fetch(new URL('/not-a-koti-page', base));
assert.equal(missing.status, 404, 'Unknown paths must not silently show Money');
console.log('Navigation smoke passed: root redirect, four direct routes/titles, unknown-route 404.');
