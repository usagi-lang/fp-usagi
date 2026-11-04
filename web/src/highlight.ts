import { LANGUAGE } from '../../src/language.ts';
import { Words } from '../../src/words.ts';
import type { Keyword } from '../../src/words.ts';

const words = new Words(LANGUAGE);

const KEYWORD_CLASS: Record<Keyword, string> = {
  print: 'io',
  charPrint: 'io',
  input: 'io',
  assignment: 'bind',
  add: 'op',
  subtract: 'op',
  multiply: 'op',
  divide: 'op',
  equal: 'cmp',
  less: 'cmp',
  greater: 'cmp',
  return: 'ret',
  blockStart: 'block',
  blockEnd: 'block',
  functionStart: 'decl',
};

export function tokenClass(text: string): string {
  const word = words.classify(text);
  switch (word.kind) {
    case 'keyword':
      return KEYWORD_CLASS[word.keyword];
    case 'number':
      return 'num';
    case 'variable':
    case 'varCall':
      return 'var';
    case 'funcDecl':
    case 'funcEnd':
      return 'decl';
    case 'funcCall':
    case 'funcRef':
      return 'fn';
    case 'unknown':
      return 'bad';
  }
}

export const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const inline = (text: string) => escape(text).replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);

export function highlight(source: string): string {
  const lines = source.split('\n').map((line) => {
    const hash = line.indexOf('#');
    const code = hash < 0 ? line : line.slice(0, hash);
    const comment = hash < 0 ? '' : `<span class="t-comment">${escape(line.slice(hash))}</span>`;
    return code.replace(/\S+/g, (token) => `<span class="t-${tokenClass(token)}">${escape(token)}</span>`) + comment;
  });
  return lines.join('\n') + '\n';
}
