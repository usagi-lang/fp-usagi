import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Session, run } from '../src/interpreter.ts';
import { encodeList, encodeNumber, encodeText } from '../src/encode.ts';
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
  test('gcd', () => assert.equal(exec(example('gcd.yaha')), '12\n'));
  test('sort', () => assert.equal(exec(example('sort.yaha')), lines('[1, 2, 3, 5, 8, 9]', '1', '2', '28')));
  test('twice', () => assert.equal(exec(example('twice.yaha')), '16\n81\n'));
  test('closure-list', () => assert.equal(exec(example('closure-list.yaha')), lines('1', '2', '3', '4', '5', '1', '4', '9', '16', '25', '55')));
  test('list', () => {
    assert.equal(exec(example('list.yaha')), lines('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]', '[1, 4, 9, 16, 25, 36, 49, 64, 81, 100]', '[1, 3, 5, 7, 9]', '385'));
  });
  test('primes', () => assert.equal(exec(example('primes.yaha')), '[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]\n'));
  test('reverse', () => assert.equal(exec(example('reverse.yaha'), '우사기랭!\n다음 줄'), '!랭기사우\n'));
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

  test('푸리리리리릿 은 나머지이고 부호는 나뉘는 수를 따른다', () => {
    assert.equal(exec('미이이야하 푸리리리리릿 야하!!!!!!! 야하!!!'), '1\n');
    assert.equal(exec('미이이야하 푸리리리리릿 이야하!!!!!!! 야하!!'), '-1\n');
    assert.equal(exec('미이이야하 푸리리리리릿 야하!!!!!!! 이야하!!'), '1\n');
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

  test('값 자리의 푸루 는 조건식이다', () => {
    assert.equal(exec('미이이야하 푸루루 야하!! 야하!!! 야하!!!!!!! 야하!!!!!!!!'), '7\n');
    assert.equal(exec('미이이야하 푸루루루 야하!! 야하!!! 야하!!!!!!! 야하!!!!!!!!'), '8\n');
    assert.equal(exec('미이이야하 푸루 푸루루 야하!!! 야하!!! 야하! 야하'), '1\n');
  });

  test('조건식은 고른 쪽만 계산한다', () => {
    assert.equal(exec('미이이야하 푸루 야하 야하 야하!! 푸리리리릿 야하! 야하'), '2\n');
    assert.equal(exec('미이이야하 푸루 야하 야하! 푸리리리릿 야하! 야하 야하!!!'), '3\n');
    assert.equal(exec(lines('미이이야하 푸루 야하 야하 야하 야푸', '미이이야하 야푸'), 'A'), lines('0', '65'));
  });

  test('조건식은 겹쳐 쓸 수 있다', () => {
    const sign = (n: number) => exec(`미이이야하 푸루루 ${encodeNumber(BigInt(n))} 야하 이야하! 푸루 ${encodeNumber(BigInt(n))} 야하 야하 야하!`);
    assert.equal(sign(-5), '-1\n');
    assert.equal(sign(0), '0\n');
    assert.equal(sign(5), '1\n');
  });

  test('푸루 는 함수도 비교한다', () => {
    assert.equal(exec(lines('우라-야하! 하아!', '하아?', '우라-야하! 하아아!', '하아아?', '미이이야하 푸루 하아 하아 야하! 야하', '미이이야하 푸루 하아 하아아 야하! 야하')), lines('1', '0'));
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

  test('푸루야 는 같은 줄의 값만 돌려준다', () => {
    const source = lines('우라-야하! 하아! 우', '푸루 우 야하 푸루야', '푸루 우 야하! 푸루야 야하!!!', '푸루야 야하!!!!!!!', '하아?', '미이이야하 하아- 야하', '미이이야하 하아- 야하!', '미이이야하 하아- 야하!!');
    assert.equal(exec(source), lines('0', '3', '7'));
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

  test('조건식 안의 꼬리 호출도 스택을 쓰지 않는다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루야 푸루 우 야하 우라 하아- 푸리릿 우 야하! 푸릿 우라 우', '하아?', `미이이야하 하아- ${encodeNumber(100000n)} 야하`);
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

describe('목록', () => {
  const list = (...items: number[]) => items.reduceRight((rest, n) => `유후 ${encodeNumber(BigInt(n))} ${rest}`, '우이');

  test('우이 는 빈 목록이고 유후 는 앞에 값을 붙인다', () => {
    assert.equal(exec(lines('미이이야하 우이', `미이이야하 ${list(1, 2, 3)}`)), lines('[]', '[1, 2, 3]'));
  });

  test('유후후 는 첫 값, 유후후후 는 나머지', () => {
    assert.equal(exec(lines(`미이이야하 유후후 ${list(7, 8, 9)}`, `미이이야하 유후후후 ${list(7, 8, 9)}`, `미이이야하 유후후후 ${list(7)}`)), lines('7', '[8, 9]', '[]'));
  });

  test('목록 안에 목록과 함수를 넣을 수 있다', () => {
    assert.equal(exec(lines('우라-야하! 하아!', '하아?', `미이이야하 유후 ${list(1)} 유후 우이 유후 하아 우이`)), '[[1], [], 하아]\n');
  });

  test('유후후후후 는 두 수 사이의 정수 목록', () => {
    assert.equal(exec(lines('미이이야하 유후후후후 이야하!! 야하!!', '미이이야하 유후후후후 야하!!! 야하!')), lines('[-2, -1, 0, 1, 2]', '[]'));
  });

  test('야앗 은 map, 야아앗 은 filter, 야아아앗 은 fold', () => {
    const range = '유후후후후 야하! 야하!!!!!!';
    assert.equal(exec(`미이이야하 야앗 우라-야하! 우 하! 푸루야 푸릿 우 우 하? ${range}`), '[2, 4, 6, 8, 10, 12]\n');
    assert.equal(exec(`미이이야하 야아앗 우라-야하! 우 하! 푸루야 푸루루루 우 야하!!! 야하! 야하 하? ${range}`), '[4, 5, 6]\n');
    assert.equal(exec(`미이이야하 야아아앗 우라-야하! 우 우라 하! 푸루야 유후 우라 우 하? 우이 ${range}`), '[6, 5, 4, 3, 2, 1]\n');
  });

  test('이름 있는 함수도 넘길 수 있다', () => {
    const source = lines('우라-야하! 하아! 우', '푸루야 푸리리릿 우 우', '하아?', `미이이야하 야앗 하아 ${list(1, 2, 3)}`);
    assert.equal(exec(source), '[1, 4, 9]\n');
  });

  test('푸루 는 목록을 값으로 비교한다', () => {
    assert.equal(exec(lines(
      `미이이야하 푸루 ${list(1, 2)} ${list(1, 2)} 야하! 야하`,
      `미이이야하 푸루 ${list(1, 2)} ${list(1, 3)} 야하! 야하`,
      `미이이야하 푸루 ${list(1)} 우이 야하! 야하`,
      '미이이야하 푸루 우이 우이 야하! 야하',
      '미이이야하 푸루 우이 야하 야하! 야하',
    )), lines('1', '0', '0', '1', '0'));
  });

  test('빈 목록을 조건으로 재귀한다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루야 푸루 우 우이 우라 하아- 유후후후 우 푸릿 우라 유후후 우', '하아?', `미이이야하 하아- 유후후후후 야하! ${encodeNumber(100000n)} 야하`);
    assert.equal(exec(source), '5000050000\n');
  });

  test('긴 목록도 멀쩡하다', () => {
    assert.equal(exec(`미이이야하 야아아앗 우라-야하! 우 우라 하! 푸루야 푸릿 우 우라 하? 야하 야앗 우라-야하! 우 하! 푸루야 푸리리릿 우 야하!! 하? 유후후후후 야하! ${encodeNumber(200000n)}`), `${200000n * 200001n}\n`);
  });

  test('미이이이이야하 는 글자 목록을 한 번에 출력한다', () => {
    assert.equal(exec(`미이이이이야하 ${list(0xc6b0, 0xb77c, 33, 10)}`), '우라!\n');
    assert.equal(exec('미이이이이야하 우이'), '');
  });

  test('목록은 바뀌지 않는다', () => {
    const source = lines(`미야아아 우 ${list(2, 3)}`, '미야아아 우라 유후 야하! 우', '미이이야하 우', '미이이야하 우라');
    assert.equal(exec(source), lines('[2, 3]', '[1, 2, 3]'));
  });
});

describe('부분 적용, 합성, 파이프', () => {
  const add = lines('우라-야하! 하아! 우 우라', '푸루야 푸릿 우 우라', '하아?');
  const mul = lines('우라-야하! 하아아! 우 우라', '푸루야 푸리리릿 우 우라', '하아아?');

  test('후응 은 첫 매개변수를 채운 함수를 만든다', () => {
    assert.equal(exec(add + lines('미야아아 우 후응 하아 야하!!!!!!!!!!', '미이이야하 우- 야하!!!')), '13\n');
    assert.equal(exec(lines('미야아아 우 후응 우라-야하! 우 우라 하! 푸루야 푸리릿 우 우라 하? 야하!!!!!!!!!!', '미이이야하 우- 야하!!!')), '7\n');
  });

  test('후응 을 거듭하면 매개변수를 차례로 채운다', () => {
    assert.equal(exec(add + lines('미야아아 우 후응 후응 하아 야하!! 야하!!!', '미이이야하 우-')), '5\n');
  });

  test('부분 적용한 함수를 목록 함수에 넘긴다', () => {
    assert.equal(exec(mul + '미이이야하 야앗 후응 하아아 야하!!! 유후후후후 야하! 야하!!!!\n'), '[3, 6, 9, 12]\n');
  });

  test('후으응 은 앞의 함수를 먼저, 뒤의 함수를 나중에 적용한다', () => {
    const source = add + mul + lines('미야아아 우 후으응 후응 하아 야하!!!!!!!!!! 후응 하아아 야하!!', '미이이야하 우- 야하!');
    assert.equal(exec(source), '22\n');
  });

  test('합성한 함수는 앞 함수의 매개변수 개수를 따른다', () => {
    const source = add + mul + lines('미야아아 우 후으응 하아 후응 하아아 야하!!', '미이이야하 우- 야하!!! 야하!!!!', '미이이야하 후으으응 야하!! 후응 우 야하!');
    assert.equal(exec(source), lines('14', '6'));
  });

  test('후으으응 은 값을 함수에 넘기고, 이어 쓰면 왼쪽부터 차례로 적용한다', () => {
    assert.equal(exec(add + mul + '미이이야하 후으으응 후으으응 야하!!! 후응 하아 야하!!!!!!!!!! 후응 하아아 야하!!\n'), '26\n');
  });

  test('푸루야 바로 뒤의 후으으응 도 꼬리 호출이다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루야 푸루 우 야하 우라 후으으응 푸릿 우라 우 후응 하아 푸리릿 우 야하!', '하아?', `미이이야하 하아- ${encodeNumber(100000n)} 야하`);
    assert.equal(exec(source), '5000050000\n');
  });

  test('만든 함수도 값이라서 출력하고 비교할 수 있다', () => {
    assert.equal(exec(add + lines('미야아아 우 후응 하아 야하!', '미이이야하 우', '미이이야하 후으응 우 우', '미이이야하 푸루 우 우 야하! 야하', '미이이야하 푸루 우 후응 하아 야하! 야하! 야하')), lines('하아', '후으응', '1', '0'));
  });
});

describe('우사기 말을 함수로', () => {
  test('이 는 계산 말을 함수로 만든다', () => {
    assert.equal(exec('미이이야하 야아아앗 이 푸릿 야하 유후후후후 야하! 야하!!!!!!!!!!\n'), '55\n');
    assert.equal(exec('미이이야하 야아아앗 이 푸리리릿 야하! 유후후후후 야하! 야하!!!!!\n'), '120\n');
    assert.equal(exec('미야아아 우 이 푸리릿\n미이이야하 우- 야하!!!!!!! 야하!!\n'), '5\n');
  });

  test('부분 적용과 함께 쓴다', () => {
    assert.equal(exec('미이이야하 야앗 후응 이 푸리리릿 야하!! 유후후후후 야하! 야하!!!!!\n'), '[2, 4, 6, 8, 10]\n');
  });

  test('비교 말은 1과 0을 돌려주고, 이어 쓰면 OR가 된다', () => {
    assert.equal(exec('미야아아 우 이 푸루루\n미이이야하 우- 야하! 야하!!\n미이이야하 우- 야하!! 야하!\n'), lines('1', '0'));
    assert.equal(exec('미이이야하 야아앗 후응 이 푸루루 야하!!! 유후후후후 야하! 야하!!!!!!\n'), '[4, 5, 6]\n');
    assert.equal(exec('미이이야하 야아앗 후응 이 푸루루루 푸루 야하!!! 유후후후후 야하! 야하!!!!!!\n'), '[1, 2, 3]\n');
  });

  test('목록 말과 목록 함수도 함수가 된다', () => {
    const pairs = '유후 유후 야하! 유후 야하!! 우이 유후 유후 야하!!! 우이 우이';
    assert.equal(exec(`미이이야하 야앗 이 유후후 ${pairs}\n`), '[1, 3]\n');
    assert.equal(exec(`미이이야하 야앗 이 유후후후 ${pairs}\n`), '[[2], []]\n');
    assert.equal(exec('미이이야하 후으으응 유후후후후 야하! 야하!!! 후응 이 야앗 후응 이 푸릿 야하!!!!!!!!!!\n'), '[11, 12, 13]\n');
    assert.equal(exec('미야아아 우 후으응 이 유후후후 이 유후후\n미이이야하 우- 유후 야하! 유후 야하!! 우이\n'), '2\n');
  });

  test('출력하면 말 이름이 나오고, 같은 말이면 같은 함수다', () => {
    assert.equal(exec('미이이야하 이 푸릿\n미이이야하 이 푸루 푸루루\n'), lines('푸릿', '푸루 푸루루'));
    assert.equal(exec('미이이야하 푸루 이 푸릿 이 푸릿 야하! 야하\n'), '1\n');
    assert.equal(exec('미이이야하 푸루 이 푸릿 이 푸리릿 야하! 야하\n'), '0\n');
    assert.equal(exec('미이이야하 푸루 후응 이 푸릿 야하! 후응 이 푸릿 야하!! 야하! 야하\n'), '0\n');
  });

  test('푸루야 바로 뒤에서 불러도 된다', () => {
    const source = lines('우라-야하! 하아! 우 우라', '푸루야 우- 우라 우라', '하아?', '미이이야하 하아- 이 푸리리릿 야하!!!!!!!');
    assert.equal(exec(source), '49\n');
  });

  test('고르지 않은 쪽의 이 는 계산하지 않는다', () => {
    assert.equal(exec('미이이야하 푸루 야하 야하! 이 유후후 야하!!!\n'), '3\n');
  });
});

describe('나눠 묶기', () => {
  test('유후 로 첫 값과 나머지를 한 번에 묶는다', () => {
    assert.equal(exec('미야아아 유후 우 우라 유후후후후 야하! 야하!!!!!\n미이이야하 우\n미이이야하 우라\n'), lines('1', '[2, 3, 4, 5]'));
  });

  test('겹쳐 쓰면 앞에서부터 여러 값을 묶는다', () => {
    assert.equal(exec('미야아아 유후 우 유후 우라 우라라 유후후후후 야하! 야하!!!!!\n미이이야하 우\n미이이야하 우라\n미이이야하 우라라\n'), lines('1', '2', '[3, 4, 5]'));
    assert.equal(exec('미야아아 유후 유후 우 우라 우라라 유후 유후 야하!!! 우이 우이\n미이이야하 우\n미이이야하 우라\n미이이야하 우라라\n'), lines('3', '[]', '[]'));
  });

  test('묶는 값은 묶기 전의 이름으로 계산한다', () => {
    assert.equal(exec('미야아아 우 유후후후후 야하! 야하!!!\n미야아아 유후 우라 우 우\n미이이야하 우라\n미이이야하 우\n'), lines('1', '[2, 3]'));
  });

  test('목록 재귀에 쓴다', () => {
    const insert = lines(
      '우라-야하! 하아! 우 우라',
      '푸루 우 우이 푸루야 유후 우라 우이',
      '미야아아 유후 우라라 우라라라 우',
      '푸루야 푸루루 우라 우라라 유후 우라 우 유후 우라라 하아- 우라라라 우라',
      '하아?',
    );
    assert.equal(exec(insert + '미이이야하 야아아앗 하아 우이 유후 야하!!! 유후 야하! 유후 야하!!!! 유후 야하!! 우이\n'), '[1, 2, 3, 4]\n');
  });

  test('블록 안에서 나눠 묶은 값은 블록 밖에서 안 보인다', () => {
    assert.equal(exec(lines('미야아아 우 야하!!!!!!!', '푸루 야하 야하 하!', '  미야아아 유후 우 우라 유후 야하! 우이', '  미이이야하 우', '하?', '미이이야하 우')), lines('1', '7'));
  });

  test('건너뛰는 조건문 안의 나눠 묶기는 계산하지 않는다', () => {
    assert.equal(exec(lines('푸루 야하 야하! 미야아아 유후 우 우라 우이', '미이이야하 야하!')), '1\n');
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
  test('오류에는 플레이그라운드가 표시할 위치가 담긴다', () => {
    const position = (source: string) => {
      try {
        exec(source);
      } catch (err) {
        return (err as UsagiError).pos;
      }
      return undefined;
    };
    assert.deepEqual(position(lines('미이이야하 야하!', '미이이야하 푸릿 야하! 우이')), { line: 2, col: 7 });
    assert.deepEqual(position(lines('미이이야하 야하!', '  하!')), { line: 2, col: 3 });
    assert.deepEqual(position(lines('미야아아 우 야하!', '미이이야하 우-')), { line: 2, col: 7 });
  });
  test('값만 덩그러니', () => fails('야하!', '덩그러니'));
  test('닫지 않은 블록', () => fails('하! 미이이야하 야하!', "'하?'(으)로 닫아야 하는데 코드가 끝났어"));
  test('연 적 없는 블록 끝', () => fails('하?', "연 적 없는 '하?'"));
  test('함수 끝 번호가 다르다', () => fails(lines('우라-야하! 하아!', '하아아?'), "'하아?'(으)로 닫아야 하는데 '하아아?'가 나왔어"));
  test('닫지 않은 함수', () => fails('우라-야하! 하아! 푸루야 야하', "'하아?'(으)로 닫아야 하는데 코드가 끝났어"));
  test('같은 글자 수의 매개변수', () => fails(lines('우라-야하! 하아! 우라 우아', '하아?'), '매개변수'));
  test('같은 곳에 같은 함수 두 번', () => fails(lines('우라-야하! 하아!', '하아?', '우라-야하! 하아!', '하아?'), '두 번'));
  test('없는 함수', () => fails('미이이야하 하아아-', "'하아아-'... 그런 함수는 없어"));
  test('함수가 아닌 변수 부르기', () => fails(lines('미야아아 우 야하!', '미이이야하 우-'), '함수가 아니라서'));
  test('나눠 묶기에는 변수나 유후', () => {
    fails('미야아아 야하! 야하!', "'미야아아' 다음엔 변수나 '유후'가 와야 해");
    fails('미야아아 유후 우 야하! 우이', "'유후' 다음엔 변수나 '유후'가 와야 해");
    fails('미야아아 유후 우라 우아 우이', "'우아'와 글자 수가 같은 변수가 이미 있어");
  });
  test('빈 목록이나 목록이 아닌 값은 나눠 묶을 수 없다', () => {
    fails('미야아아 유후 우 우라 우이', "'유후'... 빈 목록은 나눠 묶을 수 없어");
    fails('미야아아 유후 우 유후 우라 우라라 유후 야하! 우이', "'유후'... 빈 목록은 나눠 묶을 수 없어");
    fails('미야아아 유후 우 우라 야하!!', "'유후'에는 목록이 와야 하는데 정수가 왔어");
  });
  test('이 다음엔 값을 받는 말', () => {
    fails('미이이야하 이 우이', "'이' 다음엔 값을 받는 우사기 말이 와야 해");
    fails('미이이야하 이 야푸', "'이' 다음엔 값을 받는 우사기 말이 와야 해");
    fails('미이이야하 이 미이이야하 야하!', "'이' 다음엔 값을 받는 우사기 말이 와야 해");
    fails('미이이야하 이', "'이' 다음엔 값을 받는 우사기 말이 와야 해");
    fails('미이이야하 이 야하!!', "음수라면 '이야하!!'처럼 붙여 써");
  });
  test('이 로 만든 함수만 덩그러니', () => fails('이 푸릿', '덩그러니'));
  test('이 로 만든 함수의 오류는 그 말을 가리킨다', () => {
    assert.throws(() => exec('미이이야하 야앗 이 유후후 유후 우이 우이'), (err: unknown) => err instanceof UsagiError && err.message.includes("'유후후'... 빈 목록에는 첫 값이 없어") && err.pos?.col === 12);
    fails('미이이야하 야앗 이 푸릿 유후 야하! 우이', "'야앗'에 넘긴 함수는 매개변수가 1개여야 하는데 2개야");
    fails('미이이야하 야아아앗 이 푸리리리릿 야하! 유후 야하 우이', '0으로는 나눌 수 없어');
  });
  test('이름 없는 함수는 하! 로 본문을 연다', () => fails('미야아아 우 우라-야하! 우 푸루야 우', '본문을 열어야'));
  test('조건문 다음에 할 일이 없다', () => fails('푸루 야하 야하', '할 일이 없어'));
  test('0으로 나누기', () => {
    fails('미이이야하 푸리리리릿 야하! 야하', '0으로는 나눌 수 없어');
    fails('미이이야하 푸리리리리릿 야하! 야하', '0으로는 나눌 수 없어');
  });
  test('함수로 계산', () => fails(lines('우라-야하! 하아!', '하아?', '미이이야하 푸릿 하아 야하!'), "'푸릿'에는 정수가 와야 하는데 함수가 왔어"));
  test('조건식에 값이 모자라다', () => fails('미이이야하 푸루 야하 야하 야하!', '값이 와야 하는데 코드가 끝났어'));
  test('없는 글자', () => fails('미이이이야하 이야하!', '글자는 없어'));
  test('빈 목록의 첫 값과 나머지', () => {
    fails('미이이야하 유후후 우이', "'유후후'... 빈 목록에는 첫 값이 없어");
    fails('미이이야하 유후후후 우이', "'유후후후'... 빈 목록에는 나머지가 없어");
  });
  test('목록이 아닌 값', () => {
    fails('미이이야하 유후 야하! 야하!!', "'유후'에는 목록이 와야 하는데 정수가 왔어");
    fails('미이이야하 유후후 야하!', "'유후후'에는 목록이 와야 하는데 정수가 왔어");
    fails('미이이이이야하 야하!', "'미이이이이야하'에는 목록이 와야 하는데 정수가 왔어");
  });
  test('목록으로 계산', () => fails('미이이야하 푸릿 우이 야하!', "'푸릿'에는 정수가 와야 하는데 목록이 왔어"));
  test('함수 자리에 다른 값', () => fails('미이이야하 야앗 야하! 우이', "'야앗'에는 함수가 와야 하는데 정수가 왔어"));
  test('넘긴 함수의 매개변수 개수', () => {
    fails('미이이야하 야앗 우라-야하! 우 우라 하! 하? 우이', "'야앗'에 넘긴 함수는 매개변수가 1개여야 하는데 2개야");
    fails('미이이야하 야아아앗 우라-야하! 우 하! 하? 야하 우이', "'야아아앗'에 넘긴 함수는 매개변수가 2개여야 하는데 1개야");
  });
  test('걸러 내는 함수는 정수를 돌려줘야 한다', () => fails('미이이야하 야아앗 우라-야하! 우 하! 푸루야 우이 하? 유후 야하! 우이', "'야아앗'에는 정수가 와야 하는데 목록이 왔어"));
  test('목록 출력에 없는 글자', () => fails('미이이이이야하 유후 이야하! 우이', '글자는 없어'));
  test('빈 목록만 덩그러니', () => fails('우이', '덩그러니'));
  test('매개변수가 없는 함수는 부분 적용할 수 없다', () => fails(lines('우라-야하! 하아!', '하아?', '미이이야하 후응 하아 야하!'), "'후응'에 넘긴 함수는 매개변수가 1개 이상이어야 해"));
  test('합성과 파이프의 함수 자리', () => {
    fails('미이이야하 후으응 야하! 야하!', "'후으응'에는 함수가 와야 하는데 정수가 왔어");
    fails(lines('우라-야하! 하아! 우 우라', '하아?', '미이이야하 후으응 하아 하아'), "'후으응'에 넘긴 함수는 매개변수가 1개여야 하는데 2개야");
    fails('미이이야하 후으으응 야하! 우이', "'후으으응'에는 함수가 와야 하는데 목록이 왔어");
  });
  test('꼬리가 아닌 깊은 재귀는 너무 깊이 들어간 호출을 가리킨다', () => {
    const source = lines('우라-야하! 하아! 우', '푸루 우 야하 푸루야 야하', '푸루야 푸릿 야하! 하아- 푸리릿 우 야하!', '하아?', `미이이야하 하아- ${encodeNumber(1000000n)}`);
    assert.throws(
      () => exec(source),
      (err: unknown) => err instanceof UsagiError && err.message.includes('너무 깊이') && err.message.includes('꼬리 호출') && err.pos?.line === 3 && err.pos.col === 12,
    );
  });
  test('목록 함수 안의 깊은 재귀도 자리를 가리킨다', () => {
    const source = lines('우라-야하! 하아! 우', '푸루야 푸릿 야하! 유후후 야앗 하아 유후 우 우이', '하아?', '미이이야하 하아- 야하!');
    assert.throws(() => exec(source), (err: unknown) => err instanceof UsagiError && err.message.includes('너무 깊이') && err.pos !== undefined);
  });
});

describe('인코더', () => {
  test('정수 왕복', () => {
    for (const n of [0n, 1n, 12n, 13n, 72n, 1000n, 50864n, -5n, -100n, 123456789n]) {
      assert.equal(exec(`미이이야하 ${encodeNumber(n)}`), `${n}\n`);
    }
  });

  test('글 왕복', () => {
    const text = '우라! Hello\n푸루루\t🐰\n\n끝';
    assert.equal(exec(encodeText(text)), text);
    assert.equal(exec(encodeText('')), '');
  });

  test('글을 목록 식으로', () => {
    assert.equal(exec(`미이이야하 ${encodeList('AB')}`), '[65, 66]\n');
    assert.equal(exec(`미이이이이야하 ${encodeList('우라~')}`), '우라~');
  });
});
