import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { run } from '../src/interpreter.ts';
import { LANGUAGE } from '../src/language.ts';
import type { Language } from '../src/language.ts';
import { DICTIONARY, TOUR } from '../web/src/docs.ts';
import { notes } from '../scripts/release-notes.ts';
import pkg from '../package.json' with { type: 'json' };

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const examples = readdirSync(new URL('../examples/', import.meta.url)).filter((name) => name.endsWith('.yaha'));

const FRAGMENTS = new Set<keyof Language>([
  'Number', 'Negative', 'FunctionPrefix', 'FunctionUnit', 'FunctionDeclSuffix', 'FunctionEndSuffix', 'FunctionCallSuffix',
]);
const KEYWORDS = (Object.keys(LANGUAGE) as (keyof Language)[]).filter((field) => !FRAGMENTS.has(field)).map((field) => LANGUAGE[field]);

function output(source: string): string {
  let text = '';
  run(source, { write: (chunk) => { text += chunk; }, read: () => -1 });
  return text;
}

const shown = (source: string) => output(source).trimEnd().split('\n').join(', ');
const words = (text: string) => new Set(text.split(/\s+/).filter(Boolean));
const codeSpans = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

type Fence = { lang: string; code: string; after: string };

function fences(text: string): Fence[] {
  const lines = text.split('\n');
  const found: Fence[] = [];
  for (let k = 0; k < lines.length; k++) {
    const open = lines[k].match(/^```(\S*)$/);
    if (!open) continue;
    const start = k + 1;
    while (k + 1 < lines.length && lines[++k] !== '```');
    const after = lines.slice(k + 1).find((line) => line.trim()) ?? '';
    found.push({ lang: open[1], code: lines.slice(start, k).join('\n') + '\n', after });
  }
  return found;
}

describe('버전과 바뀐 점', () => {
  test('package.json 버전의 내용이 CHANGELOG에 있다', () => {
    assert.ok(notes(changelog, pkg.version), `CHANGELOG.md에 ## [${pkg.version}] 항목이 필요합니다`);
  });

  test('CHANGELOG 맨 위는 다음 버전, 그다음이 지금 버전이다', () => {
    const headings = [...changelog.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(headings[0], '다음 버전');
    assert.match(headings[1], new RegExp(`^\\[${pkg.version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`));
  });

  test('버전마다 릴리스 링크가 있다', () => {
    for (const [, version] of changelog.matchAll(/^## \[([^\]]+)\]/gm)) {
      assert.ok(changelog.includes(`[${version}]: https://github.com/usagi-lang/fp-usagi/releases/tag/v${version}`), version);
    }
  });
});

describe('문서', () => {
  test('모든 키워드가 플레이그라운드 사전에 있다', () => {
    const dictionary = new Set(DICTIONARY.flatMap((entry) => [...words(entry.word)]));
    for (const keyword of KEYWORDS) assert.ok(dictionary.has(keyword), keyword);
  });

  test('모든 키워드가 README 사전에 있다', () => {
    const table = readme.slice(readme.indexOf('## 사전'), readme.indexOf('## 명세'));
    const spans = new Set(codeSpans(table).flatMap((span) => [...words(span)]));
    for (const keyword of KEYWORDS) assert.ok(spans.has(keyword), keyword);
  });

  test('둘러보기에 적힌 결과가 실제 출력과 같다', () => {
    for (const item of TOUR) assert.equal(shown(item.code), item.result, item.title);
  });

  test('README 코드에 적힌 결과가 실제 출력과 같다', () => {
    const samples = fences(readme).filter((fence) => fence.lang === '' && fence.after.startsWith('→ '));
    assert.ok(samples.length > 0);
    for (const { code, after } of samples) assert.equal(shown(code), after.slice(2).replace(/`/g, ''), code);
  });

  test('README 첫 예제의 출력이 맞다', () => {
    const [code, result] = fences(readme);
    assert.equal(result.lang, 'text');
    assert.equal(output(code.code), result.code);
  });
});

describe('플레이그라운드 페이지', () => {
  const page = read('web/index.html');
  const meta = (property: string) => page.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]+)"`))?.[1];

  test('링크 미리보기 카드 정보가 있다', () => {
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) assert.ok(meta(property), property);
  });

  test('미리보기 그림 파일이 배포 폴더에 있다', () => {
    const image = new URL(meta('og:image')!);
    const base = new URL(meta('og:url')!);
    assert.ok(image.href.startsWith(base.href), image.href);
    const file = image.href.slice(base.href.length);
    assert.ok(readdirSync(new URL('../web/public/', import.meta.url)).includes(file), file);
    assert.equal(pkg.homepage, base.href);
  });
});

describe('예제 목록', () => {
  test('모든 예제가 오류 없이 끝난다', () => {
    for (const name of examples) assert.doesNotThrow(() => output(read(`examples/${name}`)), name);
  });

  test('모든 예제가 플레이그라운드 목록에 있다', () => {
    const list = read('web/src/examples.ts');
    for (const name of examples) assert.ok(list.includes(`id: '${name.replace(/\.yaha$/, '')}'`), name);
  });

  test('모든 예제가 README 예제 표에 있다', () => {
    for (const name of examples) assert.ok(readme.includes(`[${name}](examples/${name})`), name);
  });

  test('README의 예제 개수가 맞다', () => {
    assert.ok(readme.includes(`예제 ${examples.length}개`), `README 구조에 "예제 ${examples.length}개"가 필요합니다`);
  });
});
