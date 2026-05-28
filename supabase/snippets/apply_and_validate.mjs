/**
 * apply_and_validate.mjs
 * Applies patch_maps_url_constraint.sql and runs validate_phase1a.sh
 * via Node.js child_process to avoid shell quoting issues.
 *
 * Usage: node supabase/snippets/apply_and_validate.mjs
 */
import { spawnSync, execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const DB_CONTAINER = 'supabase_db_hop-rental';
const PSQL = ['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'];

function psql(sql) {
  const result = spawnSync(PSQL[0], PSQL.slice(1), {
    input: sql,
    encoding: 'utf8',
    timeout: 15000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', code: result.status };
}

function psqlQuery(sql) {
  const r = psql(`\\t \\a \n${sql}`);
  return (r.stdout + r.stderr).trim();
}

// ─── Apply constraint patch ───────────────────────────────────────────────────
console.log('\n=== Applying maps_url constraint patch (remove goo.gl) ===');
const patchSQL = readFileSync(join(__dir, 'patch_maps_url_constraint.sql'), 'utf8');
const patchResult = psql(patchSQL);
console.log(patchResult.stdout.trim());
if (patchResult.stderr.trim()) console.log('STDERR:', patchResult.stderr.trim());

// ─── Run validation ───────────────────────────────────────────────────────────
console.log('\n=== Running validate_phase1a.sh ===');
const validateResult = spawnSync('bash', [join(__dir, 'validate_phase1a.sh')], {
  encoding: 'utf8',
  timeout: 120000,
  stdio: 'inherit',
});
process.exit(validateResult.status ?? 0);
