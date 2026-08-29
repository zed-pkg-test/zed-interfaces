#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'targets.json'), 'utf8'));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function equal(actual, expected, label) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function walk(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    check(!/(token|secret|password|credential|private.?key|api.?key)/i.test(key), `${path}.${key}: credential-shaped keys are forbidden`);
    walk(child, `${path}.${key}`);
  }
}

check(manifest.version === 1, 'manifest version must be 1');
check(/^[0-9a-f]{40}$/.test(manifest.template?.revision ?? ''), 'template revision must be an immutable 40-character SHA');
equal(manifest.adapters?.rust, ['sea-orm'], 'Rust adapters');
equal(manifest.adapters?.node, ['drizzle', 'prisma', 'typeorm'], 'Node adapters');
equal(manifest.adapters?.go, ['gorm', 'ent'], 'Go adapters');
equal(manifest.adapters?.dart, ['drift', 'stormberry'], 'Dart adapters');
check(manifest.authority?.forbiddenAlternative === '*-orm-core', '*-orm-core must be recorded as a forbidden competing authority');

const targets = manifest.targets ?? [];
check(targets.length === 27, `expected 27 organizations, found ${targets.length}`);
const organizations = new Set();
const targetKeys = new Set();
const sourceRepos = new Set();
for (const target of targets) {
  const key = `${target.organization}/${target.targetRepository}`;
  check(!organizations.has(target.organization), `duplicate organization: ${target.organization}`);
  organizations.add(target.organization);
  check(!targetKeys.has(key), `duplicate target: ${key}`);
  targetKeys.add(key);
  check(target.targetRepository === `${target.canonicalPrefix}-lib-core`, `${key}: target name must derive from canonicalPrefix`);
  check(['existing', 'missing'].includes(target.repositoryState), `${key}: invalid repositoryState`);
  check(['implementation-in-pr', 'semantic-reconciliation-required', 'create-required'].includes(target.rolloutState), `${key}: invalid rolloutState`);
  check(Array.isArray(target.sourceRepositories) && target.sourceRepositories.length > 0, `${key}: sourceRepositories is required`);
  for (const source of target.sourceRepositories ?? []) {
    const [owner, name, extra] = source.split('/');
    check(Boolean(owner && name && !extra), `${key}: invalid source repository ${source}`);
    check(owner === target.organization, `${key}: source owner ${owner} must equal organization ${target.organization}`);
    check(/-(interfaces|clients)$/.test(name ?? ''), `${key}: trigger source must end exactly in -interfaces or -clients: ${source}`);
    check(!sourceRepos.has(source), `source repository appears in more than one target: ${source}`);
    sourceRepos.add(source);
  }
  if (target.canonicalSourceRepository) {
    check(target.sourceRepositories.includes(target.canonicalSourceRepository), `${key}: canonicalSourceRepository must be listed as a source`);
  }
  for (const legacy of target.legacySourceRepositories ?? []) {
    check(target.sourceRepositories.includes(legacy), `${key}: legacy source ${legacy} must be listed as a source`);
    check(legacy !== target.canonicalSourceRepository, `${key}: canonical and legacy source cannot be the same`);
  }
  if (target.repositoryState === 'missing') check(target.rolloutState === 'create-required', `${key}: missing repos must be create-required`);
}

const mappings = Object.fromEntries(targets.map((target) => [target.organization, target.targetRepository]));
const requiredMappings = {
  '3FA-app': '3fa-lib-core',
  'apostille-me': 'apme-lib-core',
  'canonical-cloud': 'canonical-lib-core',
  'embedded-alerts': 'eal-lib-core',
  'evento-globolo': 'evgl-lib-core',
  'fiducia-cloud': 'fiducia-lib-core',
  'hacker-house-medellin': 'hhm-lib-core',
  'hypesiege': 'hsg-lib-core',
  'led-dynamo': 'leddy-lib-core',
  'memebank': 'mbk-lib-core',
  'messaging-intel': 'msgint-lib-core',
  'sonus-auris': 'sonus-auris-lib-core',
  'voxletra': 'vxl-lib-core'
};
for (const [organization, repository] of Object.entries(requiredMappings)) {
  check(mappings[organization] === repository, `${organization}: expected canonical target ${repository}`);
}

const existing = targets.filter((target) => target.repositoryState === 'existing');
const missing = targets.filter((target) => target.repositoryState === 'missing');
check(existing.length === 2, `expected 2 existing lib-core repos, found ${existing.length}`);
check(missing.length === 25, `expected 25 missing lib-core repos, found ${missing.length}`);
equal(existing.map((target) => target.organization).sort(), ['cliptown', 'zed-pkg'], 'existing organizations');
check(targets.find((target) => target.organization === 'opto-sync')?.sourceRepositories.every((source) => source.endsWith('-clients')), 'opto-sync must remain explicitly clients-triggered');
check(targets.find((target) => target.organization === 'cliptown')?.implementation?.headRevision === manifest.template.revision, 'template revision must equal the implemented ClipTown PR head');
walk(manifest);

if (failures.length) {
  console.error(`lib-core fleet manifest failed ${failures.length} check(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`validated ${targets.length} lib-core targets (${existing.length} existing, ${missing.length} create-required)`);
console.log('adapters: SeaORM; Drizzle/Prisma/TypeORM; GORM/Ent; Drift/Stormberry');
