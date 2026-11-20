import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

export function notes(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return '';
  const next = lines.findIndex((line, k) => k > start && (line.startsWith('## ') || /^\[[^\]]+\]: /.test(line)));
  return lines.slice(start + 1, next < 0 ? lines.length : next).join('\n').trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? pkg.version).replace(/^v/, '');
  if (version !== pkg.version) {
    console.error(`태그 버전(${version})과 package.json 버전(${pkg.version})이 다릅니다.`);
    process.exit(1);
  }
  const text = notes(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
  if (!text) {
    console.error(`CHANGELOG.md에 ${version} 항목이 없습니다.`);
    process.exit(1);
  }
  process.stdout.write(text + '\n');
}
