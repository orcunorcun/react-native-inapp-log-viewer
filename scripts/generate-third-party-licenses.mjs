#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'THIRD_PARTY_LICENSES.md');
const ROOT_NODE_MODULES = path.join(ROOT_DIR, 'node_modules');
const NODE_MODULES_CANDIDATES = [ROOT_NODE_MODULES, path.join(ROOT_DIR, 'example', 'node_modules')];

const escapeMarkdownCell = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const toRepositoryUrl = repository => {
  if (!repository) {
    return '';
  }

  const raw = typeof repository === 'string' ? repository : repository.url;
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  const normalized = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '');
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('github:')) {
    return `https://github.com/${normalized.slice('github:'.length)}`;
  }

  if (normalized.startsWith('git@github.com:')) {
    return `https://github.com/${normalized.slice('git@github.com:'.length)}`;
  }

  if (normalized.startsWith('git://github.com/')) {
    return `https://github.com/${normalized.slice('git://github.com/'.length)}`;
  }

  if (normalized.startsWith('git://')) {
    return `https://${normalized.slice('git://'.length)}`;
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }

  if (/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    return `https://github.com/${normalized}`;
  }

  return normalized;
};

const resolveScopeFromArgs = () => {
  const arg = process.argv.find(item => item.startsWith('--scope='));
  if (!arg) {
    return 'runtime';
  }

  const scope = arg.split('=')[1];
  return scope === 'all' ? 'all' : 'runtime';
};

const readJsonFile = async filePath => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

const normalizeLicense = license => {
  if (!license) {
    return 'UNKNOWN';
  }

  if (typeof license === 'string') {
    return license;
  }

  if (Array.isArray(license)) {
    const values = license
      .map(entry => normalizeLicense(entry))
      .filter(entry => entry && entry !== 'UNKNOWN');
    return values.length > 0 ? values.join(', ') : 'UNKNOWN';
  }

  if (typeof license === 'object' && 'type' in license && typeof license.type === 'string') {
    return license.type;
  }

  return 'UNKNOWN';
};

const getPackageInfo = async packageJsonPath => {
  const pkg = await readJsonFile(packageJsonPath);
  if (!pkg || typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
    return null;
  }

  return {
    name: pkg.name,
    version: pkg.version,
    license: normalizeLicense(pkg.license ?? pkg.licenses),
    repository: toRepositoryUrl(pkg.repository) || (typeof pkg.homepage === 'string' ? pkg.homepage : ''),
    dependencies: Object.keys(pkg.dependencies ?? {}),
    optionalDependencies: Object.keys(pkg.optionalDependencies ?? {}),
  };
};

const findPackageDirs = async startNodeModulesDir => {
  const found = [];
  const queue = [startNodeModulesDir];
  const visitedNodeModules = new Set();

  while (queue.length > 0) {
    const currentNodeModules = queue.shift();
    if (!currentNodeModules || visitedNodeModules.has(currentNodeModules)) {
      continue;
    }
    visitedNodeModules.add(currentNodeModules);

    let entries;
    try {
      entries = await fs.readdir(currentNodeModules, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === '.bin' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.name.startsWith('@')) {
        const scopeDir = path.join(currentNodeModules, entry.name);
        let scopeEntries;
        try {
          scopeEntries = await fs.readdir(scopeDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const scopeEntry of scopeEntries) {
          if (!scopeEntry.isDirectory() || scopeEntry.isSymbolicLink()) {
            continue;
          }
          const packageDir = path.join(scopeDir, scopeEntry.name);
          found.push(packageDir);

          const nestedNodeModules = path.join(packageDir, 'node_modules');
          try {
            const stat = await fs.stat(nestedNodeModules);
            if (stat.isDirectory()) {
              queue.push(nestedNodeModules);
            }
          } catch {
            // Ignore missing nested node_modules.
          }
        }

        continue;
      }

      const packageDir = path.join(currentNodeModules, entry.name);
      found.push(packageDir);

      const nestedNodeModules = path.join(packageDir, 'node_modules');
      try {
        const stat = await fs.stat(nestedNodeModules);
        if (stat.isDirectory()) {
          queue.push(nestedNodeModules);
        }
      } catch {
        // Ignore missing nested node_modules.
      }
    }
  }

  return found;
};

const collectAllInstalledPackages = async nodeModulesDirs => {
  const packages = new Map();

  for (const nodeModulesDir of nodeModulesDirs) {
    const packageDirs = await findPackageDirs(nodeModulesDir);

    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, 'package.json');
      let info;
      try {
        info = await getPackageInfo(packageJsonPath);
      } catch {
        continue;
      }

      if (!info) {
        continue;
      }

      const key = `${info.name}@${info.version}`;
      if (packages.has(key)) {
        continue;
      }

      packages.set(key, info);
    }
  }

  return [...packages.values()].sort((a, b) => {
    if (a.name === b.name) {
      return a.version.localeCompare(b.version);
    }
    return a.name.localeCompare(b.name);
  });
};

const resolvePackageJsonFrom = (moduleName, fromDir) => {
  try {
    return require.resolve(`${moduleName}/package.json`, { paths: [fromDir] });
  } catch {
    return null;
  }
};

const collectRuntimePackages = async () => {
  const rootPackageJsonPath = path.join(ROOT_DIR, 'package.json');
  const rootPkg = await readJsonFile(rootPackageJsonPath);
  const runtimeEntries = [
    ...Object.keys(rootPkg.dependencies ?? {}),
    ...Object.keys(rootPkg.optionalDependencies ?? {}),
    ...Object.keys(rootPkg.peerDependencies ?? {}),
  ];

  const packages = new Map();
  for (const moduleName of runtimeEntries) {
    const resolvedPackageJsonPath = resolvePackageJsonFrom(moduleName, ROOT_DIR);
    if (!resolvedPackageJsonPath) {
      continue;
    }

    let info;
    try {
      info = await getPackageInfo(resolvedPackageJsonPath);
    } catch {
      continue;
    }
    if (!info) {
      continue;
    }

    const key = `${info.name}@${info.version}`;
    if (!packages.has(key)) {
      packages.set(key, info);
    }
  }

  return [...packages.values()].sort((a, b) => {
    if (a.name === b.name) {
      return a.version.localeCompare(b.version);
    }
    return a.name.localeCompare(b.name);
  });
};

const generateMarkdown = ({ scope, packages, peerDependencies }) => {
  const generatedAt = new Date().toISOString();
  const unknownLicenseCount = packages.filter(pkg => pkg.license === 'UNKNOWN').length;
  const scopeTitle =
    scope === 'runtime'
      ? 'direct runtime requirements (dependencies + optionalDependencies + peerDependencies)'
      : 'all installed packages (library + example)';
  const lines = [
    '# Third-Party Licenses',
    '',
    `Generated at: ${generatedAt} Scope: ${scopeTitle}`,
    '',
    `Total packages: ${packages.length}`,
    `Packages with unknown license: ${unknownLicenseCount}`,
    '',
    '| Package | Version | License | Repository/Homepage |',
    '| --- | --- | --- | --- |',
    ...packages.map(pkg => {
      const repoCell = pkg.repository ? `[link](${pkg.repository})` : '-';
      return `| ${escapeMarkdownCell(pkg.name)} | ${escapeMarkdownCell(pkg.version)} | ${escapeMarkdownCell(pkg.license)} | ${repoCell} |`;
    }),
    '',
    '## Peer Dependencies (Not Bundled)',
    '',
    ...(peerDependencies.length > 0
      ? [
          '| Package | Range |',
          '| --- | --- |',
          ...peerDependencies.map(item => `| ${escapeMarkdownCell(item.name)} | ${escapeMarkdownCell(item.range)} |`),
        ]
      : ['No peer dependencies declared.']),
    '',
    '> This file is auto-generated from package metadata.',
  ];

  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const scope = resolveScopeFromArgs();
  const rootPackageJsonPath = path.join(ROOT_DIR, 'package.json');
  const rootPkg = await readJsonFile(rootPackageJsonPath);
  const peerDependencies = Object.entries(rootPkg.peerDependencies ?? {}).map(([name, range]) => ({
    name,
    range: typeof range === 'string' ? range : '',
  }));

  let packages = [];

  if (scope === 'runtime') {
    try {
      const stat = await fs.stat(ROOT_NODE_MODULES);
      if (!stat.isDirectory()) {
        throw new Error();
      }
    } catch {
      throw new Error('Root node_modules not found. Install dependencies first.');
    }
    packages = await collectRuntimePackages();
  } else {
    const existingNodeModules = [];
    for (const candidate of NODE_MODULES_CANDIDATES) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          existingNodeModules.push(candidate);
        }
      } catch {
        // Ignore non-existing directory.
      }
    }

    if (existingNodeModules.length === 0) {
      throw new Error('No node_modules directory found. Install dependencies first.');
    }
    packages = await collectAllInstalledPackages(existingNodeModules);
  }

  const markdown = generateMarkdown({ scope, packages, peerDependencies });
  await fs.writeFile(OUTPUT_FILE, markdown, 'utf8');

  process.stdout.write(
    `Generated ${path.relative(ROOT_DIR, OUTPUT_FILE)} (${scope}) with ${packages.length} packages (${packages.filter(pkg => pkg.license === 'UNKNOWN').length} unknown license).\n`,
  );
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
