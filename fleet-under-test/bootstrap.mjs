#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'targets.json'), 'utf8'));

function fail(message) {
  throw new Error(message);
}

function run(command, args, { input, allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: quiet ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'inherit'],
  });
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout || 'no output'}`);
  }
  return result;
}

function ghApi(endpoint, { method = 'GET', fields = {}, input, allowFailure = false } = {}) {
  const args = ['api', endpoint, '--method', method, '--include'];
  for (const [key, value] of Object.entries(fields)) {
    args.push('-f', `${key}=${value}`);
  }
  if (input !== undefined) args.push('--input', '-');
  const result = run('gh', args, { input, allowFailure, quiet: true });
  const separator = result.stdout.indexOf('\n\n');
  const headers = separator >= 0 ? result.stdout.slice(0, separator) : '';
  const body = separator >= 0 ? result.stdout.slice(separator + 2) : result.stdout;
  const status = Number(headers.match(/^HTTP\/\S+\s+(\d+)/m)?.[1] ?? (result.status === 0 ? 200 : 0));
  let json = null;
  if (body.trim()) {
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
  }
  if (!allowFailure && (result.status !== 0 || status >= 400)) fail(`gh api ${endpoint} failed (${status}): ${body || result.stderr}`);
  return { status, body, json };
}

function parseArgs(argv) {
  const args = { apply: false, target: null, visibility: 'private', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--target') args.target = argv[++index];
    else if (arg === '--visibility') args.visibility = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (!['private', 'public'].includes(args.visibility)) fail('--visibility must be private or public');
  return args;
}

function validateManifest() {
  const result = run(process.execPath, [resolve(here, 'check.mjs')], { quiet: true, allowFailure: true });
  if (result.status !== 0) fail(result.stderr || result.stdout || 'manifest validation failed');
}

function resolveCommit(repository, ref) {
  const encoded = encodeURIComponent(ref);
  const commit = ghApi(`/repos/${repository}/commits/${encoded}`);
  const sha = commit.json?.sha;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) fail(`could not resolve ${repository}@${ref}`);
  return sha;
}

function repositoryStatus(repository) {
  const response = ghApi(`/repos/${repository}`, { allowFailure: true });
  if (response.status === 200) return { exists: true, repository: response.json };
  if (response.status === 404) return { exists: false, repository: null };
  fail(`cannot inspect ${repository}: HTTP ${response.status} ${response.body}`);
}

function contentStatus(repository, path, ref) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const response = ghApi(`/repos/${repository}/contents/${path}${query}`, { allowFailure: true });
  if (response.status === 200) return { exists: true, content: response.json };
  if (response.status === 404) return { exists: false, content: null };
  fail(`cannot inspect ${repository}/${path}: HTTP ${response.status} ${response.body}`);
}

function readRemoteText(repository, path, ref) {
  const response = contentStatus(repository, path, ref);
  if (!response.exists) fail(`${repository}@${ref}:${path} is missing`);
  if (response.content?.type !== 'file' || typeof response.content?.content !== 'string') fail(`${repository}@${ref}:${path} is not a regular file`);
  return Buffer.from(response.content.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

function createRepository(target, visibility) {
  const description = `Canonical JSON Schema, SQL, ORM adapters, and shared core routines for ${target.organization}.`;
  ghApi(`/orgs/${target.organization}/repos`, {
    method: 'POST',
    input: JSON.stringify({
      name: target.targetRepository,
      description,
      private: visibility === 'private',
      has_issues: true,
      has_projects: true,
      has_wiki: false,
      auto_init: true,
    }),
  });
  return repositoryStatus(`${target.organization}/${target.targetRepository}`).repository;
}

function field(name, schema, options = {}) {
  return {
    name,
    schema,
    required: options.required ?? true,
    ...(options.db ? { 'x-db': options.db } : {}),
  };
}

function placeholderEntity(target) {
  const prefix = target.canonicalPrefix.replace(/-/g, '_');
  const interfaceRepository = target.canonicalSourceRepository ?? target.sourceRepositories[0];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://github.com/${target.organization}/${target.targetRepository}/blob/main/schema/persistence.schema.json`,
    title: `${target.canonicalPrefix} persistence contract`,
    description: 'Bootstrap placeholder. Replace with semantically reconstructed product entities before migrations are activated.',
    type: 'object',
    'x-lib-core': {
      product: target.canonicalPrefix,
      authorityMode: 'bootstrap-placeholder',
      interfaces: {
        repository: interfaceRepository,
        revision: '__INTERFACES_REVISION__',
      },
      generation: {
        sql: ['postgres', 'sqlite'],
        rust: ['sea-orm'],
        node: ['drizzle', 'prisma', 'typeorm'],
        go: ['gorm', 'ent'],
        dart: ['drift', 'stormberry'],
      },
      reviewGates: [
        'Reconstruct entities from interfaces, migration history, application reads and writes, and live provider state.',
        'Do not activate generated SQL until destructive diff, constraints, indexes, triggers, extensions, grants, and RLS are reconciled.',
        'Do not copy another product schema merely to make code generation green.',
      ],
    },
    properties: {},
    additionalProperties: false,
    $defs: {
      BootstrapLedger: {
        title: 'BootstrapLedger',
        type: 'object',
        description: 'Non-production bootstrap row used only to prove generator wiring. Replace before migration authority is enabled.',
        'x-db': {
          table: `${prefix}_bootstrap_ledger`,
          primaryKey: ['id'],
          bootstrapOnly: true,
        },
        required: ['id', 'createdAt'],
        properties: Object.fromEntries([
          field('id', { type: 'string', format: 'uuid' }, { db: { column: 'id', sqlType: 'uuid', defaultSql: 'gen_random_uuid()' } }),
          field('createdAt', { type: 'string', format: 'date-time' }, { db: { column: 'created_at', sqlType: 'timestamptz', defaultSql: 'CURRENT_TIMESTAMP' } }),
        ].map((item) => [item.name, { ...item.schema, ...(item['x-db'] ? { 'x-db': item['x-db'] } : {}) }])),
      },
    },
  };
}

function interfacesLock(target, revisions) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    target: `${target.organization}/${target.targetRepository}`,
    sources: target.sourceRepositories.map((repository) => ({
      repository,
      revision: revisions[repository],
      role: repository === target.canonicalSourceRepository || (!target.canonicalSourceRepository && repository === target.sourceRepositories[0]) ? 'canonical' : 'migration-lineage',
    })),
  };
}

function readme(target) {
  return `# ${target.targetRepository}\n\nCanonical cross-language persistence and shared core contract for \`${target.organization}\`.\n\n## Authority\n\n- JSON Schema Draft 2020-12 is the product persistence contract after the bootstrap placeholder is replaced and reviewed.\n- PostgreSQL/SQLite SQL and all ORM bindings are generated; ORM migration commands are not schema writers.\n- Rust: SeaORM. Node.js: Drizzle, Prisma, TypeORM. Go: GORM, Ent. Dart: Drift, Stormberry.\n- Shared routines derive from exact revisions recorded in \`schema/interfaces.lock.json\`.\n\n## Bootstrap status\n\nThe initial schema is deliberately marked \`bootstrap-placeholder\`. It must not be applied to a database. Product entities must be reconstructed from interface definitions, current SQL/migrations, application reads/writes, and live-provider introspection before migration authority is enabled.\n\nRun \`node tools/schema-orm-codegen.mjs\` only after that reconstruction.\n`;
}

function ciWorkflow() {
  return `name: Schema ORM Codegen\n\non:\n  pull_request:\n  push:\n    branches: [main, dev]\n\npermissions:\n  contents: read\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - uses: actions/setup-go@v5\n        with:\n          go-version: stable\n      - name: Refuse bootstrap migration authority\n        run: |\n          if grep -q '"authorityMode": "bootstrap-placeholder"' schema/persistence.schema.json; then\n            echo 'Replace and review the bootstrap placeholder before enabling generated migrations.' >&2\n            exit 1\n          fi\n      - run: node tools/schema-orm-codegen.mjs\n      - run: node tools/schema-orm-codegen.mjs --check\n      - run: node --test tests/schema-orm-codegen.test.mjs\n`;
}

function zpkg(target) {
  return `[package]\nname = "${target.targetRepository}"\nversion = "0.1.0"\nkind = "library"\n\n[publish]\ninclude = ["schema/**", "generated/**", "tools/**", "README.md"]\n`;
}

function buildFiles(target, revisions) {
  const schema = placeholderEntity(target);
  schema['x-lib-core'].interfaces.revision = revisions[target.canonicalSourceRepository ?? target.sourceRepositories[0]];
  return new Map([
    ['README.md', readme(target)],
    ['schema/persistence.schema.json', `${JSON.stringify(schema, null, 2)}\n`],
    ['schema/interfaces.lock.json', `${JSON.stringify(interfacesLock(target, revisions), null, 2)}\n`],
    ['.github/workflows/schema-orm.yml', ciWorkflow()],
    ['.zpkg.toml', zpkg(target)],
  ]);
}

function getDefaultBranch(repository) {
  return repository.default_branch || 'main';
}

function ensureBranch(repository, branch, baseBranch) {
  const ref = ghApi(`/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, { allowFailure: true });
  if (ref.status === 200) return;
  if (ref.status !== 404) fail(`cannot inspect branch ${repository}:${branch}`);
  const base = ghApi(`/repos/${repository}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const sha = base.json?.object?.sha;
  if (!sha) fail(`cannot resolve ${repository}:${baseBranch}`);
  ghApi(`/repos/${repository}/git/refs`, { method: 'POST', input: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
}

function writeFile(repository, branch, path, content, message) {
  const existing = contentStatus(repository, path, branch);
  if (existing.exists) {
    const current = Buffer.from(existing.content.content.replace(/\n/g, ''), 'base64').toString('utf8');
    if (current === content) return 'unchanged';
    fail(`${repository}:${path} already exists with different content; semantic reconciliation is required`);
  }
  ghApi(`/repos/${repository}/contents/${path}`, {
    method: 'PUT',
    input: JSON.stringify({ message, branch, content: Buffer.from(content).toString('base64') }),
  });
  return 'created';
}

function openDraftPr(repository, branch, base, target, revisions) {
  const existing = ghApi(`/repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${target.organization}:${branch}`)}&base=${encodeURIComponent(base)}`, { allowFailure: true });
  if (existing.status === 200 && Array.isArray(existing.json) && existing.json.length) return existing.json[0].html_url;
  const sources = target.sourceRepositories.map((source) => `- \`${source}@${revisions[source]}\``).join('\n');
  const body = `## Summary\n\nBootstrap the canonical \`${target.targetRepository}\` repository for JSON Schema, SQL generation, cross-language ORM adapters, and shared routines.\n\n## Pinned sources\n\n${sources}\n\n## Safety\n\n- The initial persistence schema is marked \`bootstrap-placeholder\` and CI refuses migration authority.\n- No product entities were copied from Cliptown or inferred from repository names.\n- Existing paths fail closed instead of being overwritten.\n- Product schema review must reconcile interfaces, current migration/ORM history, application reads and writes, and live-provider state.\n- No force push is used.\n`;
  const response = ghApi(`/repos/${repository}/pulls`, {
    method: 'POST',
    input: JSON.stringify({
      title: 'feat: bootstrap canonical JSON Schema ORM core',
      head: branch,
      base,
      body,
      draft: true,
      maintainer_can_modify: true,
    }),
  });
  return response.json?.html_url;
}

function preflight(targets) {
  const plan = [];
  for (const target of targets) {
    const fullName = `${target.organization}/${target.targetRepository}`;
    const status = repositoryStatus(fullName);
    const revisions = {};
    for (const source of target.sourceRepositories) revisions[source] = resolveCommit(source, 'HEAD');
    plan.push({ target, fullName, status, revisions });
  }
  return plan;
}

function applyPlan(plan, options) {
  const results = [];
  for (const item of plan) {
    const { target, fullName, revisions } = item;
    let repository = item.status.repository;
    if (!item.status.exists) repository = createRepository(target, options.visibility);
    const base = getDefaultBranch(repository);
    const branch = `agent/lib-core-bootstrap-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    ensureBranch(fullName, branch, base);

    const files = buildFiles(target, revisions);
    for (const path of manifest.template.copyPaths) {
      files.set(path, readRemoteText(manifest.template.repository, path, manifest.template.revision));
    }
    for (const [path, content] of files) {
      writeFile(fullName, branch, path, content, `feat: bootstrap canonical ${target.targetRepository}`);
    }
    const pullRequest = openDraftPr(fullName, branch, base, target, revisions);
    results.push({ repository: fullName, branch, pullRequest, revisions });
  }
  return results;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node lib-core-fleet/bootstrap.mjs [--apply] [--target org|org/repo] [--visibility private|public]');
    console.log('Dry-run is the default. --apply performs repository, branch, file, and draft-PR writes.');
    return;
  }
  validateManifest();
  const selected = manifest.targets.filter((target) => {
    if (!options.target) return true;
    return target.organization === options.target || `${target.organization}/${target.targetRepository}` === options.target;
  });
  if (!selected.length) fail(`no targets matched ${options.target}`);
  console.log(`${options.apply ? 'apply' : 'dry-run'}: ${selected.length} target(s)`);
  const plan = preflight(selected);
  for (const item of plan) {
    console.log(`${item.fullName}: ${item.status.exists ? 'existing' : 'create-required'}`);
    for (const [repository, revision] of Object.entries(item.revisions)) console.log(`  ${repository}@${revision}`);
  }
  if (!options.apply) return;
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) fail('--apply requires authenticated gh via GH_TOKEN or GITHUB_TOKEN');
  const results = applyPlan(plan, options);
  console.log(JSON.stringify(results, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
