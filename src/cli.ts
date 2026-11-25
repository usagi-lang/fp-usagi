#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createInterface } from 'node:readline';
import { Worker } from 'node:worker_threads';
import { encodeNumber, encodeText } from './encode.ts';
import { UsagiError } from './error.ts';
import type { Job, Options, Reply } from './thread.ts';
import pkg from '../package.json' with { type: 'json' };

const STACK_MB = 256;

const USAGE = `우사기랭 ${pkg.version} — 우라-야하!

사용법:
  ura <파일.yaha>      프로그램 실행
  ura                  REPL (빈 줄: 실행, :exit: 끝)
  ura num <정수>       정수를 우사기랭 표현식으로 바꿔줌
  ura encode [문자열]  문자열을 출력하는 프로그램을 만들어줌 (문자열이 없으면 표준 입력을 읽음)
  ura --version        버전 보기`;

function report(err: unknown): void {
  if (err instanceof UsagiError) {
    console.error(err.message);
    return;
  }
  const code = (err as { code?: string; path?: string }).code;
  if (code === 'ENOENT') {
    console.error(`하아? 하아? '${(err as { path?: string }).path}' 파일을 못 찾았어... 경로를 다시 볼까?`);
    return;
  }
  throw err;
}

function thread(interactive: boolean): Worker {
  const worker = new Worker(new URL('./thread.ts', import.meta.url), {
    workerData: { interactive, tty: Boolean(process.stdout.isTTY) } satisfies Options,
    resourceLimits: { stackSizeMb: STACK_MB },
  });
  worker.on('error', (err) => {
    throw err;
  });
  return worker;
}

function execute(source: string): void {
  const worker = thread(false);
  worker.on('message', (reply: Reply) => {
    if (reply.kind === 'out') {
      process.stdout.write(reply.text);
      return;
    }
    if (reply.kind === 'warn') {
      console.error(reply.message);
      return;
    }
    if (reply.kind === 'error') {
      console.error(reply.message);
      process.exitCode = 1;
    }
    void worker.terminate();
  });
  worker.postMessage({ source } satisfies Job);
}

function repl(): void {
  const worker = thread(true);
  console.log(`우사기랭 ${pkg.version} (.yaha)\n코드를 쓰고 빈 줄을 넣으면 실행돼. :exit 로 끝내.\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });
  const queue: string[] = [];
  let source = '';
  let busy = false;
  let closed = false;
  const prompt = () => {
    if (!closed) rl.prompt();
  };
  const next = () => {
    while (!busy && queue.length) {
      const line = queue.shift()!;
      if (line === ':exit') {
        queue.length = 0;
        rl.close();
        break;
      }
      if (line !== '') {
        source += line + '\n';
        rl.setPrompt('... ');
      } else if (source) {
        busy = true;
        worker.postMessage({ source } satisfies Job);
        source = '';
        rl.setPrompt('>>> ');
        return;
      }
      prompt();
    }
    if (closed && !busy) void worker.terminate();
  };
  worker.on('message', (reply: Reply) => {
    if (reply.kind === 'out') {
      process.stdout.write(reply.text);
      return;
    }
    if (reply.kind === 'warn') {
      console.error(reply.message);
      return;
    }
    if (reply.kind === 'error') console.error(reply.message);
    busy = false;
    prompt();
    next();
  });
  rl.on('line', (line) => {
    queue.push(line);
    next();
  });
  rl.on('close', () => {
    closed = true;
    next();
  });
  rl.prompt();
}

function main(args: string[]): number | undefined {
  const [command, ...more] = args;
  if (command === '-h' || command === '--help') {
    console.log(USAGE);
    return 0;
  }
  if (command === '-v' || command === '--version') {
    console.log(pkg.version);
    return 0;
  }
  try {
    if (command === undefined) {
      repl();
      return undefined;
    }
    if (command === 'num') {
      if (!/^-?\d+$/.test(more[0] ?? '')) throw new UsagiError('정수를 하나 달래!');
      console.log(encodeNumber(BigInt(more[0])));
      return 0;
    }
    if (command === 'encode') {
      process.stdout.write(encodeText(more.length ? more.join(' ') : readFileSync(0, 'utf8')));
      return 0;
    }
    if (more.length) throw new UsagiError(`'${more[0]}'... 처음 보는 인자래!`);
    if (extname(command) !== '.yaha') console.error('하아? .yaha 파일이 아니지만 일단 돌려 볼게... 어떻게든 되어라!');
    execute(readFileSync(command, 'utf8'));
    return undefined;
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
