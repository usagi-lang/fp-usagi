import type { Reply, Request } from './worker.ts';

export type Handlers = {
  out(text: string): void;
  done(ms: number): void;
  error(message: string, ms: number): void;
};

export const TIME_LIMIT = 5000;

export class Runner {
  private worker: Worker | null = null;
  private timer = 0;

  get running(): boolean {
    return this.worker !== null;
  }

  run(source: string, input: string, handlers: Handlers): void {
    this.stop();
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.timer = window.setTimeout(() => {
      this.stop();
      handlers.error(`${TIME_LIMIT / 1000}초가 지나도 끝나지 않아서 멈췄습니다.`, TIME_LIMIT);
    }, TIME_LIMIT);
    worker.addEventListener('message', (event: MessageEvent<Reply>) => {
      const message = event.data;
      if (message.kind === 'out') return handlers.out(message.text);
      this.stop();
      if (message.kind === 'done') handlers.done(message.ms);
      else handlers.error(message.message, message.ms);
    });
    worker.addEventListener('error', (event) => {
      this.stop();
      handlers.error(event.message || '실행기를 띄우지 못했습니다.', 0);
    });
    worker.postMessage({ source, input } satisfies Request);
  }

  stop(): void {
    window.clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
  }
}
