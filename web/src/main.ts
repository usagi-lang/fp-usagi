import './style.css';
import { encodeNumber, encodeText } from '../../src/encode.ts';
import { DICTIONARY, TOUR } from './docs.ts';
import { EXAMPLES } from './examples.ts';
import type { Example } from './examples.ts';
import { escape, highlight, inline } from './highlight.ts';
import { Runner } from './runner.ts';

type State = 'idle' | 'busy' | 'ok' | 'error';
type Draft = { source: string; name: string; input: string };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const source = byId<HTMLTextAreaElement>('source');
const painted = byId<HTMLElement>('highlight');
const layer = painted.parentElement as HTMLElement;
const gutter = byId<HTMLPreElement>('gutter');
const filename = byId<HTMLElement>('filename');
const picker = byId<HTMLSelectElement>('example');
const runButton = byId<HTMLButtonElement>('run');
const shareButton = byId<HTMLButtonElement>('share');
const output = byId<HTMLPreElement>('output');
const stdin = byId<HTMLTextAreaElement>('stdin');
const status = byId<HTMLElement>('status');
const cursor = byId<HTMLElement>('cursor');
const numberInput = byId<HTMLInputElement>('num-input');
const numberOutput = byId<HTMLElement>('num-output');
const numberInsert = byId<HTMLButtonElement>('num-insert');
const textInput = byId<HTMLTextAreaElement>('text-input');

const DRAFT_KEY = 'usagi-lang:draft';
const runner = new Runner();
const runKey = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl ↵';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function render(): void {
  painted.innerHTML = highlight(source.value);
  const count = source.value.split('\n').length;
  gutter.textContent = Array.from({ length: count }, (_, i) => String(i + 1)).join('\n');
  syncScroll();
}

function syncScroll(): void {
  layer.scrollTop = source.scrollTop;
  layer.scrollLeft = source.scrollLeft;
  gutter.scrollTop = source.scrollTop;
}

function updateCursor(): void {
  const before = source.value.slice(0, source.selectionStart);
  const line = before.split('\n').length;
  const column = [...before.slice(before.lastIndexOf('\n') + 1)].length + 1;
  cursor.textContent = `${line}줄 ${column}칸`;
}

function saveDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ source: source.value, name: filename.textContent, input: stdin.value }));
  } catch {}
}

function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    return draft && typeof draft.source === 'string' ? draft : null;
  } catch {
    return null;
  }
}

function load(text: string, name: string, input?: string): void {
  source.value = text;
  filename.textContent = name;
  if (input !== undefined) stdin.value = input;
  source.scrollTop = 0;
  source.scrollLeft = 0;
  source.setSelectionRange(0, 0);
  render();
  updateCursor();
  saveDraft();
}

function loadExample(example: Example): void {
  load(example.source, `${example.id}.yaha`, example.input);
  setStatus(`${example.title} 예제를 열었습니다`, 'idle');
}

function insert(text: string): void {
  source.focus();
  if (!document.execCommand('insertText', false, text)) {
    source.setRangeText(text, source.selectionStart, source.selectionEnd, 'end');
    render();
    saveDraft();
  }
  updateCursor();
}

function setStatus(text: string, state: State): void {
  status.textContent = text;
  status.dataset.state = state;
}

function setRunning(running: boolean): void {
  runButton.dataset.running = String(running);
  runButton.querySelector('.label')!.textContent = running ? '중지' : '실행';
}

function append(text: string, kind: 'out' | 'error' | 'note'): void {
  const previous = output.textContent ?? '';
  const span = document.createElement('span');
  span.className = kind;
  span.textContent = kind !== 'out' && previous && !previous.endsWith('\n') ? `\n${text}` : text;
  output.append(span);
  output.scrollTop = output.scrollHeight;
}

const elapsed = (ms: number) => (ms < 1 ? '1ms 안에' : ms < 1000 ? `${Math.round(ms)}ms 만에` : `${(ms / 1000).toFixed(2)}초 만에`);

function run(): void {
  if (runner.running) {
    runner.stop();
    setRunning(false);
    setStatus('실행을 멈췄습니다', 'idle');
    return;
  }
  output.replaceChildren();
  setRunning(true);
  setStatus('실행 중…', 'busy');
  runner.run(source.value, stdin.value, {
    out: (text) => append(text, 'out'),
    done: (ms) => {
      setRunning(false);
      if (!output.textContent) append('출력이 없습니다.', 'note');
      setStatus(`야하! ${elapsed(ms)} 끝났습니다`, 'ok');
    },
    error: (message) => {
      setRunning(false);
      append(message, 'error');
      setStatus('하아? 오류가 났습니다', 'error');
    },
  });
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string | null {
  try {
    const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function share(): Promise<void> {
  const url = new URL(location.href);
  url.hash = `c=${toBase64Url(source.value)}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url.href);
    setStatus('공유 링크를 복사했습니다', 'ok');
  } catch {
    setStatus('주소창의 링크를 복사해서 공유하세요', 'idle');
  }
}

function setupTabs(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      byId(t.getAttribute('aria-controls')!).hidden = !selected;
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

function setupDictionary(): void {
  const list = byId<HTMLUListElement>('dict');
  for (const entry of DICTIONARY) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry';
    button.innerHTML = `<code>${highlight(entry.word).trimEnd()}</code><span>${inline(entry.meaning)}</span>`;
    button.setAttribute('aria-label', `${entry.word} 넣기, ${entry.meaning.replace(/`/g, '')}`);
    button.addEventListener('click', () => insert(entry.snippet));
    item.append(button);
    list.append(item);
  }
}

function setupTools(): void {
  const valid = () => /^-?\d+$/.test(numberInput.value.trim());
  numberInput.addEventListener('input', () => {
    const ok = valid();
    numberOutput.innerHTML = ok ? highlight(encodeNumber(BigInt(numberInput.value.trim()))).trimEnd() : '';
    numberOutput.dataset.empty = String(!ok);
    numberInsert.disabled = !ok;
  });
  numberInsert.addEventListener('click', () => {
    if (valid()) insert(encodeNumber(BigInt(numberInput.value.trim())));
  });
  byId<HTMLButtonElement>('text-make').addEventListener('click', () => {
    if (!textInput.value) {
      textInput.focus();
      return;
    }
    load(encodeText(textInput.value), '글.yaha');
    setStatus('글을 출력하는 프로그램을 만들었습니다', 'ok');
    source.focus();
  });
}

function setupTour(): void {
  const tour = byId<HTMLElement>('tour');
  const toc = byId<HTMLOListElement>('toc');
  TOUR.forEach((lesson, index) => {
    const id = `lesson-${index + 1}`;
    const article = document.createElement('article');
    article.className = 'lesson';
    article.id = id;
    article.innerHTML = `
      <h3><span class="index">${String(index + 1).padStart(2, '0')}</span>${escape(lesson.title)}</h3>
      <p>${inline(lesson.text)}</p>
      <pre class="sample"><code>${highlight(lesson.code.trimEnd()).trimEnd()}</code></pre>
      <div class="lesson-foot">
        <span class="result">결과 <code>${escape(lesson.result)}</code></span>
        <button type="button" class="ghost small">편집기에서 열기</button>
      </div>`;
    article.querySelector('button')!.addEventListener('click', () => {
      load(lesson.code, `${lesson.title}.yaha`);
      setStatus(`'${lesson.title}' 코드를 열었습니다`, 'idle');
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      source.focus({ preventScroll: true });
    });
    tour.append(article);
    const link = document.createElement('li');
    link.innerHTML = `<a href="#${id}">${escape(lesson.title)}</a>`;
    toc.append(link);
  });
}

function setupExamples(): void {
  for (const example of EXAMPLES) {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = example.title;
    picker.append(option);
  }
  picker.addEventListener('change', () => {
    const example = EXAMPLES.find((e) => e.id === picker.value);
    if (example) loadExample(example);
    picker.value = '';
    source.focus();
  });
}

function start(): void {
  byId('run-key').textContent = runKey;
  byId('run-hint').textContent = runKey;
  setupExamples();
  setupTabs();
  setupDictionary();
  setupTools();
  setupTour();

  source.addEventListener('input', () => {
    render();
    updateCursor();
    saveDraft();
  });
  source.addEventListener('scroll', syncScroll);
  for (const name of ['keyup', 'click', 'select', 'focus']) source.addEventListener(name, updateCursor);
  source.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      insert('  ');
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  });
  stdin.addEventListener('input', saveDraft);
  runButton.addEventListener('click', run);
  shareButton.addEventListener('click', share);
  byId<HTMLButtonElement>('clear').addEventListener('click', () => {
    output.replaceChildren();
    setStatus('출력을 지웠습니다', 'idle');
  });

  const shared = location.hash.startsWith('#c=') ? fromBase64Url(location.hash.slice(3)) : null;
  const draft = readDraft();
  if (shared !== null) {
    load(shared, '공유된 코드.yaha');
    setStatus('공유된 코드를 열었습니다', 'idle');
  } else if (draft) {
    load(draft.source, draft.name || 'main.yaha', draft.input);
  } else {
    loadExample(EXAMPLES[0]);
    setStatus('준비됨', 'idle');
  }
}

start();
