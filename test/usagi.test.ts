import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Session, run } from '../src/interpreter.ts';
import { encodeNumber, encodeText } from '../src/encode.ts';
import { UsagiError } from '../src/error.ts';

function io(input: string) {
  const chars = [...input].map((c) => c.codePointAt(0)!);
  const out = { text: '' };
  return { out, io: { write: (text: string) => { out.text += text; }, read: () => chars.shift() ?? -1 } };
}

function exec(source: string, input = ''): string {
  const { out, io: handle } = io(input);
  run(source, handle);
  return out.text;
}

const lines = (...rows: string[]) => rows.join('\n') + '\n';
const example = (name: string) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');

function fails(source: string, expected: RegExp | string): void {
  assert.throws(
    () => exec(source),
    (err: unknown) =>
      err instanceof UsagiError &&
      (typeof expected === 'string' ? err.message.includes(expected) : expected.test(err.message)),
  );
}

describe('예제', () => {
  test('hello', () => assert.equal(exec(example('hello.yaha')), 'Hello, world!\n'));
  test('factorial', () => assert.equal(exec(example('factorial.yaha')), '2432902008176640000\n'));
  test('fibonacci', () => assert.equal(exec(example('fibonacci.yaha')), '6765\n'));
  test('twice', () => assert.equal(exec(example('twice.yaha')), '16\n81\n'));
  test('list', () => assert.equal(exec(example('list.yaha')), lines('1', '2', '3', '4', '5', '1', '4', '9', '16', '25', '55')));
  test('echo', () => assert.equal(exec(example('echo.yaha'), '야하! 우라~\n'), '야하! 우라~\n'));
  test('fizzbuzz', () => {
    const expected = Array.from({ length: 100 }, (_, k) => {
      const i = k + 1;
      return i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i);
    });
    assert.equal(exec(example('fizzbuzz.yaha')), lines(...expected));
  });
});

describe('숫자와 변수', () => {
  test('야하 뒤 느낌표 개수가 값이고 이 를 붙일 때마다 부호가 바뀐다', () => {
    assert.equal(exec(lines('미이이야하 야하', '미이이야하 야하!!!', '미이이야하 이야하!!!', '미이이야하 이이야하!!!')), lines('0', '3', '-3', '3'));
  });

  test('변수는 글자 수로만 구분한다', () => {
    assert.equal(exec(lines('미야아아 우라 야하!!!!!', '미이이야하 우우', '미이이야하 우아')), lines('5', '5'));
  });

  test('묶지 않은 변수는 0', () => {
    assert.equal(exec('미이이야하 우라라'), '0\n');
  });

  test('다시 묶으면 앞의 값을 가린다', () => {
    assert.equal(exec(lines('미야아아 우 야하!', '미야아아 우 푸릿 우 야하!!', '미이이야하 우')), '3\n');
  });
});

describe('계산과 조건', () => {
  test('사칙연산은 전위 표기', () => {
    assert.equal(exec('미이이야하 푸릿 야하!! 야하!!!'), '5\n');
    assert.equal(exec('미이이야하 푸리릿 야하! 야하!!!'), '-2\n');
    assert.equal(exec('미이이야하 푸리리릿 야하!! 야하!!!'), '6\n');
    assert.equal(exec('미이이야하 푸리리리릿 이야하!!!!!!! 야하!!'), '-3\n');
  });

  test('큰 정수도 정확하다', () => {
    assert.equal(exec(`미이이야하 푸리리릿 ${encodeNumber(10n ** 20n)} ${encodeNumber(10n ** 20n)}`), `${10n ** 40n}\n`);
  });

  test('푸루 / 푸루루 / 푸루루루 는 같다 / 작다 / 크다', () => {
    const check = (op: string, a: number, b: number) =>
      exec(`${op} ${encodeNumber(BigInt(a))} ${encodeNumber(BigInt(b))} 미이이야하 야하!`);
    assert.equal(check('푸루', 2, 2), '1\n');
    assert.equal(check('푸루', 2, 3), '');
    assert.equal(check('푸루루', 2, 3), '1\n');
    assert.equal(check('푸루루루', 3, 2), '1\n');
  });

  test('비교 말을 이어 쓰면 OR', () => {
    assert.equal(exec('푸루 푸루루 야하!! 야하!! 미이이야하 야하!'), '1\n');
    assert.equal(exec('푸루 푸루루 야하!!! 야하!! 미이이야하 야하!'), '');
  });

  test('조건이 거짓이면 다음 문장이나 블록 하나를 건너뛴다', () => {
    assert.equal(exec(lines('푸루 야하! 야하!! 미이이야하 야하!', '미이이야하 야하!!')), '2\n');
    assert.equal(exec(lines('푸루 야하! 야하!! 하! 미이이야하 야하! 미이이야하 야하! 하?', '미이이야하 야하!!')), '2\n');
  });

  test('블록 없는 중첩 조건문도 건너뛴다', () => {
    assert.equal(exec(lines('푸루 야하! 야하!! 푸루 야하! 야하! 미이이야하 야하!', '미이이야하 야하!!')), '2\n');
  });

  test('블록 안에서 묶은 값은 블록 밖에서 보이지 않는다', () => {
    assert.equal(exec(lines('미야아아 우 야하!', '푸루 야하 야하 하! 미야아아 우 야하!! 미이이야하 우 하?', '미이이야하 우')), lines('2', '1'));
  });
});

describe('함수', () => {
  test('선언하기 전에 불러도 된다', () => {
    assert.equal(exec(lines('미이이야하 하아- 야하!!', '우라-야하! 하아! 우', '푸루야 푸릿 우 우', '하아?')), '4\n');
  });

  test('푸루야 가 없거나 비어 있으면 0', () => {
    assert.equal(exec(lines('우라-야하! 하아!', '하아?', '우라-야하! 하아아!', '푸루야', '하아아?', '미이이야하 하아-', '미이이야하 하아아-')), lines('0', '0'));
  });

  test('이름 있는 함수는 블록이 시작될 때의 값을 본다', () => {
    assert.equal(exec(lines('미야아아 우라 야하!!!!!', '우라-야하! 하아! 우우우', '푸루야 우라', '하아?', '미이이야하 하아- 야하!')), '0\n');
  });

  test('함수 안의 함수는 바깥 매개변수를 기억한다', () => {
    const source = lines('우라-야하! 하아! 우', '우라-야하! 하아아! 우라', '푸루야 푸릿 우 우라', '하아아?', '푸루야 하아아- 야하!!', '하아?', '미이이야하 하아- 야하!!!!!');
    assert.equal(exec(source), '7\n');
  });

  test('이름 없는 함수는 그 자리의 값을 기억한다', () => {
    const source = lines('미야아아 우 야하!!!', '미야아아 우라 우라-야하! 우우우 하! 푸루야 푸리리릿 우 우우우 하?', '미야아아 우 야하!!!!!!!!!!', '미이이야하 우라- 야하!!');
    assert.equal(exec(source), '6\n');
  });

  test('함수를 값으로 넘기고 변수에 담아 부른다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루야 우- 우라', '하아?', '우라-야하! 하아아! 우', '푸루야 푸릿 우 우', '하아아?', '미이이야하 하아- 하아아 야하!!!!!', '미이이야하 하아아');
    assert.equal(exec(source), lines('10', '하아아'));
  });

  test('꼬리 재귀는 십만 번 돌아도 멀쩡하다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루 우 야하 푸루야 우라', '푸루야 하아- 푸리릿 우 야하! 푸릿 우라 우', '하아?', `미이이야하 하아- ${encodeNumber(100000n)} 야하`);
    assert.equal(exec(source), '5000050000\n');
  });

  test('세션은 묶은 값과 함수를 이어서 기억한다', () => {
    const { out, io: handle } = io('');
    const session = new Session(handle);
    session.run(lines('미야아아 우 야하!!!', '우라-야하! 하아! 우라', '푸루야 푸릿 우라 우라', '하아?'));
    session.run('미이이야하 하아- 우');
    assert.equal(out.text, '6\n');
  });
});

describe('입출력과 읽기', () => {
  test('미이이이야하 는 글자를, 야푸 는 입력 한 글자를', () => {
    assert.equal(exec(`미이이이야하 ${encodeNumber(0xc6b0n)}`), '우');
    assert.equal(exec(lines('미이이야하 야푸', '미이이야하 야푸'), 'A'), lines('65', '-1'));
  });

  test('# 뒤와 BOM 은 읽지 않는다', () => {
    assert.equal(exec('﻿# 주석\n미이이야하 야하! # 하나\n'), '1\n');
  });
});

describe('오류', () => {
  test('모르는 말은 위치와 함께 알려준다', () => fails('\n  안녕', /\(2줄 3칸\) '안녕'... 우사기는 그런 말 안 해/));
  test('값만 덩그러니', () => fails('야하!', '덩그러니'));
  test('닫지 않은 블록', () => fails('하! 미이이야하 야하!', "'하?'(으)로 닫아야 하는데 코드가 끝났어"));
  test('연 적 없는 블록 끝', () => fails('하?', "연 적 없는 '하?'"));
  test('함수 끝 번호가 다르다', () => fails(lines('우라-야하! 하아!', '하아아?'), "'하아?'(으)로 닫아야 하는데 '하아아?'가 나왔어"));
  test('닫지 않은 함수', () => fails('우라-야하! 하아! 푸루야 야하', "'하아?'(으)로 닫아야 하는데 코드가 끝났어"));
  test('같은 글자 수의 매개변수', () => fails(lines('우라-야하! 하아! 우라 우아', '하아?'), '매개변수'));
  test('같은 곳에 같은 함수 두 번', () => fails(lines('우라-야하! 하아!', '하아?', '우라-야하! 하아!', '하아?'), '두 번'));
  test('없는 함수', () => fails('미이이야하 하아아-', "'하아아-'... 그런 함수는 없어"));
  test('함수가 아닌 변수 부르기', () => fails(lines('미야아아 우 야하!', '미이이야하 우-'), '함수가 아니라서'));
  test('대입 다음엔 변수', () => fails('미야아아 야하! 야하!', '변수가 와야'));
  test('이름 없는 함수는 하! 로 본문을 연다', () => fails('미야아아 우 우라-야하! 우 푸루야 우', '본문을 열어야'));
  test('조건문 다음에 할 일이 없다', () => fails('푸루 야하 야하', '할 일이 없어'));
  test('0으로 나누기', () => fails('미이이야하 푸리리리릿 야하! 야하', '0으로는 나눌 수 없어'));
  test('함수로 계산', () => fails(lines('우라-야하! 하아!', '하아?', '미이이야하 푸릿 하아 야하!'), '정수가 필요해'));
  test('없는 글자', () => fails('미이이이야하 이야하!', '글자는 없어'));
  test('꼬리가 아닌 깊은 재귀', () => {
    const source = lines('우라-야하! 하아! 우', '푸루 우 야하 푸루야 야하', '푸루야 푸릿 야하! 하아- 푸리릿 우 야하!', '하아?', `미이이야하 하아- ${encodeNumber(1000000n)}`);
    fails(source, '너무 깊이');
  });
});

describe('인코더', () => {
  test('정수 왕복', () => {
    for (const n of [0n, 1n, 12n, 13n, 72n, 1000n, 50864n, -5n, -100n, 123456789n]) {
      assert.equal(exec(`미이이야하 ${encodeNumber(n)}`), `${n}\n`);
    }
  });

  test('글 왕복', () => {
    const text = '우라! Hello\n푸루루\t🐰';
    assert.equal(exec(encodeText(text)), text);
  });
});
