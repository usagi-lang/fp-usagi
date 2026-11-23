import { readSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { Session } from './interpreter.ts';
import { UsagiError } from './error.ts';

export type Options = { interactive: boolean; tty: boolean };
export type Job = { source: string };
export type Reply = { kind: 'out'; text: string } | { kind: 'done' } | { kind: 'error'; message: string };

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

const port = parentPort!;
const { interactive, tty } = workerData as Options;
const reply = (message: Reply) => port.postMessage(message);
const stdin = interactive ? () => -1 : stdinReader();
let pending = '';

const flush = () => {
  if (pending) reply({ kind: 'out', text: pending });
  pending = '';
};

const session = new Session({
  write: (text) => {
    pending += text;
    if (tty || pending.length >= 4096) flush();
  },
  read: () => {
    flush();
    return stdin();
  },
});

port.on('message', ({ source }: Job) => {
  try {
    session.run(source);
    flush();
    reply({ kind: 'done' });
  } catch (err) {
    flush();
    if (!(err instanceof UsagiError)) throw err;
    reply({ kind: 'error', message: err.message });
  }
});
