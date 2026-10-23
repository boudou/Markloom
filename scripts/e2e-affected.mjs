// Runs the end-to-end tests a branch's changes can affect (#216). The changed files come from git,
// e2e/impact.json maps them to test tags, and Playwright runs the tests carrying those tags in both
// projects (Markdown mode and Rich text). A shared foundation or an unmapped file runs every test.
//
//   node scripts/e2e-affected.mjs [--base <ref>] [--dry-run] [-- <playwright args>]
//   node scripts/e2e-affected.mjs --check
//
// --base     compare with this ref (default origin/main); uncommitted and untracked files count too
// --dry-run  print the selection and the Playwright command without running it
// --check    fail when a file under src/ matches no glob in e2e/impact.json, a test has no tag,
//            a mapped tag is on no test, or a glob matches no file
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const IMPACT_FILE = 'e2e/impact.json';

const SPEC_FILE = /^e2e\/[^/]+\.spec\.ts$/;

/** A test or describe call with a single-quoted title; group 1 is `.describe` for a group */
const TEST_TITLE = /\btest(\.describe)?(?:\.(?:only|skip|fixme|fail|serial|parallel))*\(\s*'((?:[^'\\]|\\.)*)'/g;

const TAG = /@[a-z][a-z0-9-]*/g;

const VALID_TAG = /^@[a-z][a-z0-9-]*$/;

/**
 * @typedef {object} Impact
 * @property {string[]} fullSuite Globs whose change runs every test
 * @property {Map<string, string[]>} areas Glob -> tags of the tests it can affect
 */

/**
 * @typedef {object} FileSelection
 * @property {string} file
 * @property {'full' | 'unmapped' | 'tags'} kind
 * @property {string[]} tags Test tags, or a spec's file name for its own tests
 */

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** @param {string} output */
function lines(output) {
  return output.split('\n').flatMap((line) => (line.trim() === '' ? [] : [line.trim()]));
}

/** @param {string} file @param {string} glob */
function matches(file, glob) {
  return posix.matchesGlob(file, glob);
}

/** @param {string} reason */
function invalidImpact(reason) {
  return new Error(`${IMPACT_FILE}: ${reason}`);
}

/** @param {string} label @param {*} value */
function parseStringList(label, value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalidImpact(`${label} must be a list of strings`);
  }

  return value;
}

/** Parses e2e/impact.json, the boundary where its contents get their types */
function readImpact() {
  const raw = JSON.parse(readFileSync(IMPACT_FILE, 'utf8'));
  const fullSuite = parseStringList('fullSuite', raw.fullSuite);

  if (raw.areas === null || typeof raw.areas !== 'object' || Array.isArray(raw.areas)) {
    throw invalidImpact('areas must map globs to lists of tags');
  }

  const areas = new Map();

  for (const [glob, value] of Object.entries(raw.areas)) {
    const tags = parseStringList(`areas["${glob}"]`, value);
    const badTag = tags.find((tag) => !VALID_TAG.test(tag));

    if (badTag !== undefined) throw invalidImpact(`"${badTag}" in areas["${glob}"] is not a tag like @export`);

    areas.set(glob, tags);
  }

  return /** @type {Impact} */ ({ fullSuite, areas });
}

/** Every title in a spec file, with whether it names a describe group */
function specTitles(file) {
  const text = readFileSync(file, 'utf8');

  return [...text.matchAll(TEST_TITLE)].map((match) => ({ group: match[1] !== undefined, title: match[2] }));
}

/** @param {string} title */
function titleTags(title) {
  return title.match(TAG) ?? [];
}

/** Changed paths against the base, renames under both names, plus uncommitted and untracked files */
function changedFiles(base) {
  const statusPaths = (output) => lines(output).flatMap((line) => line.split('\t').slice(1));
  const committed = statusPaths(git(['diff', '--name-status', '-M', `${base}...HEAD`]));
  const uncommitted = statusPaths(git(['diff', '--name-status', '-M', 'HEAD']));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));

  return [...new Set([...committed, ...uncommitted, ...untracked])].sort();
}

/** @param {string} file @param {Impact} impact @returns {FileSelection} */
function selectFile(file, impact) {
  if (impact.fullSuite.some((glob) => matches(file, glob))) return { file, kind: 'full', tags: [] };

  // A changed spec runs its own tests (Playwright's grep also sees the file name); a deleted one has none left
  if (SPEC_FILE.test(file)) return { file, kind: 'tags', tags: existsSync(file) ? [posix.basename(file)] : [] };

  const tags = new Set();
  let mapped = false;

  for (const [glob, globTags] of impact.areas) {
    if (!matches(file, glob)) continue;

    mapped = true;

    for (const tag of globTags) tags.add(tag);
  }

  return mapped ? { file, kind: 'tags', tags: [...tags].sort() } : { file, kind: 'unmapped', tags: [] };
}

/** @param {FileSelection} selection */
function describeSelection(selection) {
  if (selection.kind === 'full') return 'every test (shared foundation)';

  if (selection.kind === 'unmapped') return `every test (no glob in ${IMPACT_FILE})`;

  if (SPEC_FILE.test(selection.file)) return selection.tags.length === 0 ? 'no tests (deleted)' : 'its own tests';

  return selection.tags.length === 0 ? 'no tests' : selection.tags.join(' ');
}

/** @param {string[]} playwrightArgs @param {boolean} dryRun */
function runPlaywright(playwrightArgs, dryRun) {
  console.log(`\n> playwright test ${playwrightArgs.map((arg) => (/[\s|()?!]/.test(arg) ? `"${arg}"` : arg)).join(' ')}`);

  if (dryRun) return 0;

  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [cli, 'test', ...playwrightArgs], { stdio: 'inherit' });

  return result.status ?? 1;
}

/** @param {string} base @param {boolean} dryRun @param {string[]} forwarded */
function runAffected(base, dryRun, forwarded) {
  let files;

  try {
    files = changedFiles(base);
  } catch {
    console.error(`Can't compare with "${base}". Fetch it first (git fetch origin main) or pass --base <ref>.`);

    return 2;
  }

  const impact = readImpact();
  const selections = files.map((file) => selectFile(file, impact));

  console.log(`Changed files against ${base}:`);

  if (selections.length === 0) console.log('  (none)');

  for (const selection of selections) console.log(`  ${selection.file}  ->  ${describeSelection(selection)}`);

  if (selections.some(({ kind }) => kind !== 'tags')) {
    console.log('\nSelection: the full suite, in both projects (markdown, rich-text)');

    return runPlaywright(forwarded, dryRun);
  }

  const tags = [...new Set(selections.flatMap(({ tags: fileTags }) => fileTags))].sort();

  if (tags.length === 0) {
    console.log('\nSelection: no end-to-end test is affected');

    return 0;
  }

  console.log(`\nSelection: ${tags.join(' ')}, in both projects (markdown, rich-text)`);

  // A tag ends at anything but a word character or hyphen, so @export doesn't select @exports
  const pattern = `(?:${tags.map((tag) => tag.replaceAll('.', '\\.')).join('|')})(?![\\w-])`;

  return runPlaywright(['--grep', pattern, ...forwarded], dryRun);
}

function runCheck() {
  const impact = readImpact();
  const globs = [...impact.fullSuite, ...impact.areas.keys()];
  const repoFiles = lines(git(['ls-files', '--cached', '--others', '--exclude-standard'])).filter((file) => existsSync(file));
  const problems = [];

  for (const file of repoFiles) {
    if (file.startsWith('src/') && !globs.some((glob) => matches(file, glob))) {
      problems.push(`${file} matches no glob in ${IMPACT_FILE}`);
    }
  }

  for (const glob of globs) {
    if (!repoFiles.some((file) => matches(file, glob))) problems.push(`"${glob}" in ${IMPACT_FILE} matches no file`);
  }

  const carried = new Set();
  const specs = readdirSync('e2e').flatMap((name) => (SPEC_FILE.test(`e2e/${name}`) ? [`e2e/${name}`] : []));

  for (const spec of specs) {
    for (const { group, title } of specTitles(spec)) {
      const tags = titleTags(title);

      for (const tag of tags) carried.add(tag);

      if (!group && tags.length === 0) problems.push(`${spec}: test '${title}' has no area tag`);
    }
  }

  for (const [glob, tags] of impact.areas) {
    for (const tag of tags) {
      if (!carried.has(tag)) problems.push(`${tag} (for "${glob}") is on no test, so that change would run nothing`);
    }
  }

  if (problems.length > 0) {
    console.error(`The end-to-end gate has gaps:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);

    return 1;
  }

  console.log(`${IMPACT_FILE} covers every file under src/, and every mapped tag is on a test (${carried.size} tags).`);

  return 0;
}

function main() {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string', default: 'origin/main' },
      check: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  return values.check ? runCheck() : runAffected(values.base, values['dry-run'], positionals);
}

process.exitCode = main();
