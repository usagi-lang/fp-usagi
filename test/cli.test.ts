import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeNumber } from '../src/encode.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const folder = mkdtempSync(join(tmpdir(), 'usagi-cli-'));

function ura(args: string[], input = '') {
  return spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });
}

function file(name: string, source: string): string {
  const path = join(folder, name);
  writeFileSync(path, source);
  return path;
}

describe('ura 명령', () => {
  test('표준 입력을 읽는다', () => {
    const result = ura([fileURLToPath(new URL('../examples/echo.yaha', import.meta.url))], '야하! 우라~\n');
    assert.equal(result.stdout, '야하! 우라~\n');
    assert.equal(result.status, 0);
  });

  test('꼬리가 아닌 재귀도 깊이 들어간다', () => {
    const source = ['우라-야하! 하아! 우', '푸루 우 야하 푸루야 야하', '푸루야 푸릿 우 하아- 푸리릿 우 야하!', '하아?', `미이이야하 하아- ${encodeNumber(20000n)}`].join('\n');
    const result = ura([file('deep.yaha', source)]);
    assert.equal(result.stdout, `${20000n * 20001n / 2n}\n`);
    assert.equal(result.status, 0);
  });

  test('오류는 표준 오류로 알리고 1로 끝난다', () => {
    const result = ura([file('error.yaha', '미이이야하 야하!\n미이이야하 유후후 우이\n')]);
    assert.equal(result.stdout, '1\n');
    assert.match(result.stderr, /^하아\? 하아\? \(2줄 7칸\) '유후후'/);
    assert.equal(result.status, 1);
  });

  test('대화형 모드는 앞에서 묶은 값을 기억한다', () => {
    const result = ura([], '미야아아 우 야하!!!\n\n미이이야하 우\n\n:exit\n');
    assert.match(result.stdout, /3\n/);
    assert.equal(result.status, 0);
  });
});
