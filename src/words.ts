import type { Language } from './language.ts';

export type Keyword =
  | 'print' | 'charPrint' | 'textPrint' | 'input'
  | 'equal' | 'less' | 'greater'
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'remainder'
  | 'return' | 'blockStart' | 'blockEnd' | 'functionStart' | 'assignment'
  | 'empty' | 'cons' | 'head' | 'tail' | 'range' | 'map' | 'filter' | 'fold'
  | 'partial' | 'compose' | 'pipe' | 'reference';

export type Word =
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'number'; value: bigint }
  | { kind: 'variable'; slot: number }
  | { kind: 'varCall'; slot: number }
  | { kind: 'funcDecl'; index: number }
  | { kind: 'funcEnd'; index: number }
  | { kind: 'funcCall'; index: number }
  | { kind: 'funcRef'; index: number }
  | { kind: 'unknown' };

const KEYWORDS: [keyof Language, Keyword][] = [
  ['Print', 'print'],
  ['CharPrint', 'charPrint'],
  ['TextPrint', 'textPrint'],
  ['Input', 'input'],
  ['Equal', 'equal'],
  ['Less', 'less'],
  ['Greater', 'greater'],
  ['Add', 'add'],
  ['Subtract', 'subtract'],
  ['Multiply', 'multiply'],
  ['Divide', 'divide'],
  ['Remainder', 'remainder'],
  ['Return', 'return'],
  ['BlockStart', 'blockStart'],
  ['BlockEnd', 'blockEnd'],
  ['FunctionStart', 'functionStart'],
  ['Assignment', 'assignment'],
  ['Empty', 'empty'],
  ['Cons', 'cons'],
  ['Head', 'head'],
  ['Tail', 'tail'],
  ['Range', 'range'],
  ['Map', 'map'],
  ['Filter', 'filter'],
  ['Fold', 'fold'],
  ['Partial', 'partial'],
  ['Compose', 'compose'],
  ['Pipe', 'pipe'],
  ['Reference', 'reference'],
];

const VARIABLE_LETTERS = new Set(['우', '라', '아']);

function variableSlot(text: string): number {
  const chars = [...text];
  return chars[0] === '우' && chars.every((c) => VARIABLE_LETTERS.has(c)) ? chars.length : 0;
}

export class Words {
  lang: Language;
  private keywords: Map<string, Keyword>;

  constructor(lang: Language) {
    this.lang = lang;
    this.keywords = new Map(KEYWORDS.map(([field, keyword]) => [lang[field], keyword]));
  }

  functionName(index: number, suffix = ''): string {
    return this.lang.FunctionPrefix + this.lang.FunctionUnit.repeat(index) + suffix;
  }

  classify(text: string): Word {
    const keyword = this.keywords.get(text);
    if (keyword) return { kind: 'keyword', keyword };
    const fn = this.functionWord(text);
    if (fn) return fn;
    const value = this.number(text);
    if (value !== null) return { kind: 'number', value };
    const slot = variableSlot(text);
    if (slot) return { kind: 'variable', slot };
    const call = this.lang.FunctionCallSuffix;
    if (text.endsWith(call)) {
      const callee = variableSlot(text.slice(0, -call.length));
      if (callee) return { kind: 'varCall', slot: callee };
    }
    return { kind: 'unknown' };
  }

  private functionWord(text: string): Word | null {
    const { FunctionPrefix: prefix, FunctionUnit: unit } = this.lang;
    if (!text.startsWith(prefix)) return null;
    let rest = text.slice(prefix.length);
    let index = 0;
    while (unit && rest.startsWith(unit)) {
      rest = rest.slice(unit.length);
      index++;
    }
    if (index === 0) return null;
    if (rest === this.lang.FunctionDeclSuffix) return { kind: 'funcDecl', index };
    if (rest === this.lang.FunctionEndSuffix) return { kind: 'funcEnd', index };
    if (rest === this.lang.FunctionCallSuffix) return { kind: 'funcCall', index };
    if (rest === '') return { kind: 'funcRef', index };
    return null;
  }

  private number(text: string): bigint | null {
    const { Negative: minus, Number: base } = this.lang;
    let rest = text;
    let negative = false;
    while (minus && rest.startsWith(minus)) {
      rest = rest.slice(minus.length);
      negative = !negative;
    }
    if (!rest.startsWith(base) || !/^!*$/.test(rest.slice(base.length))) return null;
    const value = BigInt(rest.length - base.length);
    return negative ? -value : value;
  }
}
