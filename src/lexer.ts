import type { Word, Words } from './words.ts';

export type Token = { kind: 'token'; text: string; word: Word; line: number; col: number; indent: number };

export function tokenize(source: string, words: Words): Token[] {
  const tokens: Token[] = [];
  source.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#')[0];
    const indent = line.search(/\S/) + 1;
    for (const m of line.matchAll(/\S+/g)) {
      tokens.push({ kind: 'token', text: m[0], word: words.classify(m[0]), line: i + 1, col: m.index! + 1, indent });
    }
  });
  return tokens;
}
