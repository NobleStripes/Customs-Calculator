import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const fail = (message) => {
  console.error(`release:check failed: ${message}`);
  process.exit(1);
};

const getMatch = (text, regex, label) => {
  const match = text.match(regex);
  if (!match) {
    fail(`Could not find ${label}.`);
  }
  return match[1];
};

const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const changelog = read('CHANGELOG.md');
const readme = read('README.md');

const pkgVersion = packageJson.version;

if (!pkgVersion) {
  fail('package.json version is missing.');
}

const lockVersion = packageLock.version;
const lockRootVersion = packageLock.packages?.['']?.version;

if (lockVersion !== pkgVersion) {
  fail(`package-lock.json version (${lockVersion}) does not match package.json version (${pkgVersion}).`);
}

if (lockRootVersion !== pkgVersion) {
  fail(`package-lock.json packages[""].version (${lockRootVersion}) does not match package.json version (${pkgVersion}).`);
}

const changelogCurrent = getMatch(
  changelog,
  /- \[v(\d+\.\d+\.\d+)\]\(docs\/changelog\/v\d+\.\d+\.\d+\.md\) - Current/,
  'CHANGELOG current release entry'
);

const changelogPkgNote = getMatch(
  changelog,
  /Project package version is currently `([^`]+)`\./,
  'CHANGELOG package version note'
);

const readmeCurrent = getMatch(
  readme,
  /### Current Release: v(\d+\.\d+\.\d+)/,
  'README current release heading'
);

if (changelogCurrent !== pkgVersion) {
  fail(`CHANGELOG current release (${changelogCurrent}) does not match package.json version (${pkgVersion}).`);
}

if (changelogPkgNote !== pkgVersion) {
  fail(`CHANGELOG package note (${changelogPkgNote}) does not match package.json version (${pkgVersion}).`);
}

if (readmeCurrent !== pkgVersion) {
  fail(`README current release (${readmeCurrent}) does not match package.json version (${pkgVersion}).`);
}

const releaseDocPath = path.join(rootDir, 'docs', 'changelog', `v${pkgVersion}.md`);
if (!fs.existsSync(releaseDocPath)) {
  fail(`Missing release notes file: docs/changelog/v${pkgVersion}.md`);
}

console.log(`release:check passed for v${pkgVersion}`);
