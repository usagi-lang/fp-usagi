import { run } from '../../src/interpreter.ts';
import { UsagiError } from '../../src/error.ts';

export type Request = { source: string; input: string };
export type Reply =
  | { kind: 'out'; text: string }
  | { kind: 'done'; ms: number }
  | { kind: 'error'; message: string; ms: number };

const OUTPUT_LIMIT = 200_000;

class OutputLimit extends Error {}

const reply = (message: Reply) => postMessage(message);

addEventListener('message', (event: MessageEvent<Request>) => {
  const { source, input } = event.data;
  const chars = [...input].map((c) => c.codePointAt(0)!);
  const started = performance.now();
  let pending = '';
  let total = 0;
  const flush = () => {
    if (pending) reply({ kind: 'out', text: pending });
    pending = '';
  };
  try {
    run(source, {
      write: (text) => {
        total += text.length;
        if (total > OUTPUT_LIMIT) throw new OutputLimit();
        pending += text;
        if (pending.length > 2048) flush();
      },
      read: () => chars.shift() ?? -1,
    });
    flush();
    reply({ kind: 'done', ms: performance.now() - started });
  } catch (err) {
    flush();
    const message =
      err instanceof UsagiError ? err.message
      : err instanceof OutputLimit ? `출력이 ${OUTPUT_LIMIT.toLocaleString('ko-KR')}글자를 넘어서 멈췄습니다.`
      : String(err);
    reply({ kind: 'error', message, ms: performance.now() - started });
  }
});
