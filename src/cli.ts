#!/usr/bin/env node
import { readFileSync, readSync } from 'node:fs';
import { extname } from 'node:path';
import { createInterface } from 'node:readline';
import { Session } from './interpreter.ts';
import { encodeNumber, encodeText } from './encode.ts';
import { UsagiError } from './error.ts';

const USAGE = `우사기랭 — 우라-야하!

사용법:
  ura <파일.yaha>    프로그램 실행
  ura                대화형 모드 (빈 줄: 실행, :exit: 끝)
  ura num <정수>     정수를 우사기 말로 바꿔줌
  ura encode [글]    글을 출력하는 프로그램을 만들어줌 (글이 없으면 표준 입력을 읽음)`;

function stdinReader(): () => number {
  const decoder = new TextDecoder();
  const buffer = Buffer.alloc(4096);
  const pending: number[] = [];
  let eof = false;
  return () => {
    while (pending.length === 0 && !eof) {
      let bytes = 0;
      try {
        bytes = readSync(0, buffer, 0, buffer.length, null);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'EAGAIN') continue;
        if (code !== 'EOF') throw err;
      }
      if (bytes === 0) eof = true;
      const text = eof ? decoder.decode() : decoder.decode(buffer.subarray(0, bytes), { stream: true });
      for (const ch of text) pending.push(ch.codePointAt(0)!);
    }
    return pending.shift() ?? -1;
  };
}

function report(err: unknown): void {
  if (err instanceof UsagiError) {
    console.error(err.message);
    return;
  }
  const code = (err as { code?: string; path?: string }).code;
  if (code === 'ENOENT') {
    console.error(`하아? 하아? '${(err as { path?: string }).path}' 파일을 못 찾았어`);
    return;
  }
  throw err;
}

function repl(): void {
  const session = new Session({ write: (text) => process.stdout.write(text), read: () => -1 });
  console.log('우사기랭 (.yaha)\n코드를 쓰고 빈 줄을 넣으면 실행돼. :exit 로 끝내.\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });
  let source = '';
  rl.prompt();
  rl.on('line', (line) => {
    if (line === ':exit') {
      rl.close();
      return;
    }
    if (line !== '') {
      source += line + '\n';
      rl.setPrompt('... ');
    } else if (source) {
      try {
        session.run(source);
      } catch (err) {
        report(err);
      }
      source = '';
      rl.setPrompt('>>> ');
    }
    rl.prompt();
  });
}

function main(args: string[]): number | undefined {
  const [command, ...more] = args;
  if (command === '-h' || command === '--help') {
    console.log(USAGE);
    return 0;
  }
  try {
    if (command === undefined) {
      repl();
      return undefined;
    }
    if (command === 'num') {
      if (!/^-?\d+$/.test(more[0] ?? '')) throw new UsagiError('정수를 하나 줘');
      console.log(encodeNumber(BigInt(more[0])));
      return 0;
    }
    if (command === 'encode') {
      process.stdout.write(encodeText(more.length ? more.join(' ') : readFileSync(0, 'utf8')));
      return 0;
    }
    if (more.length) throw new UsagiError(`'${more[0]}'... 이런 인자는 몰라`);
    if (extname(command) !== '.yaha') console.error('하아? .yaha 파일이 아니지만 일단 돌려볼게');
    new Session({ write: (text) => process.stdout.write(text), read: stdinReader() }).run(readFileSync(command, 'utf8'));
    return 0;
  } catch (err) {
    report(err);
    return 1;
  }
}

process.stdout.on('error', (err: { code?: string }) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

const code = main(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
