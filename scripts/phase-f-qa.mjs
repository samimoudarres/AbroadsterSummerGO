/**
 * Phase F — automated readiness checks (static / code-level).
 * Run: node scripts/phase-f-qa.mjs
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function has(file, needle) {
  const p = resolve(root, file);
  if (!existsSync(p)) return false;
  return readFileSync(p, 'utf8').includes(needle);
}

// Legal
ok('Privacy policy content module', existsSync(resolve(root, 'lib/legal/privacyPolicy.ts')));
ok('Terms of use content module', existsSync(resolve(root, 'lib/legal/termsOfUse.ts')));
ok('Signup opens in-app legal modal', has('components/auth/SignupFlow.tsx', 'LegalDocumentModal'));
ok('Profile menu has Privacy Policy', has('components/profile/ProfileModal.tsx', 'Privacy Policy'));
ok('Web route /privacy', existsSync(resolve(root, 'app/privacy.tsx')));
ok('Web route /terms', existsSync(resolve(root, 'app/terms.tsx')));
ok('Static privacy.html', existsSync(resolve(root, 'public/legal/privacy.html')));
ok('Static terms.html', existsSync(resolve(root, 'public/legal/terms.html')));
ok('Age gate 13+', has('lib/auth/validation.ts', 'minAge = 13'));

// Phase A–E critical invariants
const rememberSrc = readFileSync(resolve(root, 'lib/auth/authStorage.ts'), 'utf8');
ok(
  'Remember login stores identifier only',
  /never persist passwords/i.test(rememberSrc) &&
    !/export type RememberedLogin = \{[^}]*password/s.test(rememberSrc),
);
ok('Demo seed gated', has('lib/chat/repository.ts', 'allowDemoSeedMerge'));
ok('School communities RPC client', has('lib/chat/repository.ts', 'get_my_school_communities'));
ok('Trips feed RPC client', has('lib/chat/repository.ts', 'list_trips_feed'));
ok('Pending SQL bundle present', existsSync(resolve(root, 'supabase/migrations/RUN_021_022_023_024.sql')));
ok('Account deletion RPC migration', existsSync(resolve(root, 'supabase/migrations/024_delete_own_account.sql')));
ok('In-app delete account UI', has('components/profile/ProfileModal.tsx', 'Delete account'));
ok('eas.json present', existsSync(resolve(root, 'eas.json')));

// Icons — warn if not square-ish
try {
  // cannot decode png easily; check file exists
  ok('icon.png exists', existsSync(resolve(root, 'assets/icon.png')));
} catch {
  ok('icon.png exists', false);
}

// Typecheck
try {
  execSync('npx tsc --noEmit', { cwd: root, stdio: 'pipe' });
  ok('TypeScript clean', true);
} catch (e) {
  ok('TypeScript clean', false, String(e?.stdout || e?.message || e).slice(0, 200));
}

const failed = checks.filter((c) => !c.pass);
console.log('\n---');
console.log(`${checks.length - failed.length}/${checks.length} automated checks passed`);
if (failed.length) {
  console.log('Failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}

console.log(`
Manual Phase F (two real devices / accounts) — still required before submit:
  1. Fresh signup → schools → photo → host city → reopen → same profile/communities
  2. A creates trip → invites B → B accepts from notification
  3. C requests join → A approves
  4. Post with photo + tag friend → Home + profile + notification
  5. Album upload 3 photos → count stays 3 after reopen
  6. Add friend both ways → map/chat/search
  7. Airplane mode: errors visible, no silent success
  8. Confirm RUN_021_022_023_024.sql applied on production Supabase
`);
