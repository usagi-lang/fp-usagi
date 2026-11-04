import { LANGUAGE } from './language.ts';
import { Words } from './words.ts';
import type { Keyword } from './words.ts';
import { parse } from './parser.ts';
import type { Lambda, Node } from './parser.ts';
import type { Token } from './lexer.ts';
import { UsagiError } from './error.ts';

export type IO = {
  write(text: string): void;
  read(): number;
};

type Env = { slot: number; value: Value; next: Env } | null;
type Scope = { table: Map<number, Closure>; parent: Scope | null };
export type Closure = { kind: 'closure'; name: string; params: number[]; body: Node[]; env: Env; scope: Scope };
export type Value = bigint | Closure;

type Outcome =
  | { kind: 'done'; env: Env }
  | { kind: 'return'; value: Value }
  | { kind: 'tail'; fn: Closure; args: Value[] };

type Cursor = { nodes: Node[]; i: number };

const COMPARISONS = new Set<Keyword>(['equal', 'less', 'greater']);
const ARITHMETIC = new Set<Keyword>(['add', 'subtract', 'multiply', 'divide']);

export function run(source: string, io: IO): void {
  new Session(io).run(source);
}

export class Session {
  private io: IO;
  private words = new Words(LANGUAGE);
  private env: Env = null;
  private scope: Scope | null = null;

  constructor(io: IO) {
    this.io = io;
  }

  run(source: string): void {
    const nodes = parse(source, this.words);
    try {
      const scope = this.hoist(nodes, this.env, this.scope);
      this.scope = scope;
      const outcome = this.sequence({ nodes, i: 0 }, this.env, scope);
      if (outcome.kind === 'done') this.env = outcome.env;
      if (outcome.kind === 'tail') this.call(outcome.fn, outcome.args);
    } catch (err) {
      if (err instanceof RangeError) throw new UsagiError('너무 깊이 들어갔어 (재귀가 너무 깊어)');
      throw err;
    }
  }

  private hoist(nodes: Node[], env: Env, parent: Scope | null): Scope {
    const scope: Scope = { table: new Map(), parent };
    for (const node of nodes) {
      if (node.kind !== 'func') continue;
      if (scope.table.has(node.index)) throw new UsagiError(`'${node.name}' 함수가 같은 곳에 두 번 있어`, node);
      scope.table.set(node.index, { kind: 'closure', name: node.name, params: node.params, body: node.body, env, scope });
    }
    return scope;
  }

  private block(body: Node[], env: Env, scope: Scope): Outcome {
    return this.sequence({ nodes: body, i: 0 }, env, this.hoist(body, env, scope));
  }

  private sequence(cur: Cursor, env: Env, scope: Scope): Outcome {
    while (cur.i < cur.nodes.length) {
      const node = cur.nodes[cur.i++];
      if (node.kind === 'func') continue;
      if (node.kind === 'block') {
        const outcome = this.block(node.body, env, scope);
        if (outcome.kind !== 'done') return outcome;
        continue;
      }
      if (node.kind === 'lambda') throw new UsagiError('이름 없는 함수만 덩그러니 있어', node);
      const word = node.word;
      if (word.kind === 'funcCall' || word.kind === 'varCall') {
        cur.i--;
        this.expr(cur, env, scope, true);
        continue;
      }
      if (word.kind !== 'keyword') throw this.misplaced(node);
      const keyword = word.keyword;
      if (keyword === 'print') {
        this.io.write(this.show(this.expr(cur, env, scope, true)) + '\n');
      } else if (keyword === 'charPrint') {
        this.io.write(this.char(this.expr(cur, env, scope, true), node));
      } else if (keyword === 'return') {
        return this.ret(cur, env, scope);
      } else if (keyword === 'assignment') {
        const slot = this.target(cur, node);
        env = { slot, value: this.expr(cur, env, scope, true), next: env };
      } else if (COMPARISONS.has(keyword)) {
        const outcome = this.condition(node, cur, env, scope);
        if (outcome) return outcome;
      } else if (ARITHMETIC.has(keyword) || keyword === 'input') {
        cur.i--;
        this.expr(cur, env, scope, true);
      } else {
        throw this.misplaced(node);
      }
    }
    return { kind: 'done', env };
  }

  private condition(first: Token, cur: Cursor, env: Env, scope: Scope): Outcome | null {
    const ops = this.comparisons(first, cur);
    const left = this.expr(cur, env, scope, true);
    const right = this.expr(cur, env, scope, true);
    const holds = ops.some((op) => this.compare(op, left, right, first));
    const next = cur.nodes[cur.i];
    if (!next) throw new UsagiError('조건문 다음에 할 일이 없어', first);
    if (next.kind === 'block') {
      cur.i++;
      if (!holds) return null;
      const outcome = this.block(next.body, env, scope);
      return outcome.kind === 'done' ? null : outcome;
    }
    if (!holds) this.skip(cur, env, scope);
    return null;
  }

  private comparisons(first: Token, cur: Cursor): Keyword[] {
    const ops = [(first.word as { keyword: Keyword }).keyword];
    for (let next = cur.nodes[cur.i]; next?.kind === 'token' && this.isComparison(next); next = cur.nodes[++cur.i]) {
      ops.push((next.word as { keyword: Keyword }).keyword);
    }
    return ops;
  }

  private skip(cur: Cursor, env: Env, scope: Scope): void {
    const node = cur.nodes[cur.i++];
    if (node.kind === 'block' || node.kind === 'func') return;
    if (node.kind === 'lambda') throw new UsagiError('이름 없는 함수만 덩그러니 있어', node);
    const word = node.word;
    if (word.kind === 'funcCall' || word.kind === 'varCall') {
      cur.i--;
      this.expr(cur, env, scope, false);
      return;
    }
    if (word.kind !== 'keyword') throw this.misplaced(node);
    const keyword = word.keyword;
    if (keyword === 'print' || keyword === 'charPrint') {
      this.expr(cur, env, scope, false);
    } else if (keyword === 'return') {
      if (this.startsExpr(cur.nodes[cur.i])) this.expr(cur, env, scope, false);
    } else if (keyword === 'assignment') {
      this.target(cur, node);
      this.expr(cur, env, scope, false);
    } else if (COMPARISONS.has(keyword)) {
      this.comparisons(node, cur);
      this.expr(cur, env, scope, false);
      this.expr(cur, env, scope, false);
      if (!cur.nodes[cur.i]) throw new UsagiError('조건문 다음에 할 일이 없어', node);
      this.skip(cur, env, scope);
    } else if (ARITHMETIC.has(keyword) || keyword === 'input') {
      cur.i--;
      this.expr(cur, env, scope, false);
    } else {
      throw this.misplaced(node);
    }
  }

  private ret(cur: Cursor, env: Env, scope: Scope): Outcome {
    const next = cur.nodes[cur.i];
    if (!this.startsExpr(next)) return { kind: 'return', value: 0n };
    if (next.kind === 'token' && (next.word.kind === 'funcCall' || next.word.kind === 'varCall')) {
      cur.i++;
      const fn = this.callee(next, env, scope);
      const args = fn.params.map(() => this.expr(cur, env, scope, true));
      return { kind: 'tail', fn, args };
    }
    return { kind: 'return', value: this.expr(cur, env, scope, true) };
  }

  private expr(cur: Cursor, env: Env, scope: Scope, live: boolean): Value {
    const node = cur.nodes[cur.i++];
    if (!node) throw new UsagiError('값이 와야 하는데 코드가 끝났어', cur.nodes[cur.nodes.length - 1]);
    if (node.kind === 'lambda') return live ? this.lambda(node, env, scope) : 0n;
    if (node.kind !== 'token') throw new UsagiError('여기엔 값이 와야 해', node);
    const word = node.word;
    switch (word.kind) {
      case 'number':
        return word.value;
      case 'variable':
        return live ? (this.lookup(env, word.slot) ?? 0n) : 0n;
      case 'funcRef':
        return live ? this.find(scope, word.index, node) : 0n;
      case 'funcCall':
      case 'varCall': {
        const fn = this.callee(node, env, scope);
        const args = fn.params.map(() => this.expr(cur, env, scope, live));
        return live ? this.call(fn, args) : 0n;
      }
      case 'keyword':
        if (ARITHMETIC.has(word.keyword)) {
          const left = this.expr(cur, env, scope, live);
          const right = this.expr(cur, env, scope, live);
          return live ? this.arithmetic(word.keyword, left, right, node) : 0n;
        }
        if (word.keyword === 'input') return live ? BigInt(this.io.read()) : 0n;
    }
    if (word.kind === 'unknown') throw new UsagiError(`'${node.text}'... 우사기는 그런 말 안 해`, node);
    throw new UsagiError(`'${node.text}'... 여기엔 값이 와야 해`, node);
  }

  private call(fn: Closure, args: Value[]): Value {
    for (;;) {
      let env = fn.env;
      fn.params.forEach((slot, k) => {
        env = { slot, value: args[k], next: env };
      });
      const outcome = this.block(fn.body, env, fn.scope);
      if (outcome.kind !== 'tail') return outcome.kind === 'return' ? outcome.value : 0n;
      fn = outcome.fn;
      args = outcome.args;
    }
  }

  private lambda(node: Lambda, env: Env, scope: Scope): Closure {
    return { kind: 'closure', name: this.words.lang.FunctionStart, params: node.params, body: node.body, env, scope };
  }

  private callee(token: Token, env: Env, scope: Scope): Closure {
    const word = token.word;
    if (word.kind === 'funcCall') return this.find(scope, word.index, token);
    const value = word.kind === 'varCall' ? this.lookup(env, word.slot) : undefined;
    if (typeof value === 'object') return value;
    throw new UsagiError(`'${token.text}'... 함수가 아니라서 부를 수 없어`, token);
  }

  private find(scope: Scope | null, index: number, token: Token): Closure {
    for (let s = scope; s; s = s.parent) {
      const fn = s.table.get(index);
      if (fn) return fn;
    }
    throw new UsagiError(`'${token.text}'... 그런 함수는 없어`, token);
  }

  private lookup(env: Env, slot: number): Value | undefined {
    for (let e = env; e; e = e.next) if (e.slot === slot) return e.value;
    return undefined;
  }

  private target(cur: Cursor, at: Token): number {
    const node = cur.nodes[cur.i++];
    if (node?.kind !== 'token' || node.word.kind !== 'variable') {
      throw new UsagiError(`'${at.text}' 다음엔 변수가 와야 해`, node ?? at);
    }
    return node.word.slot;
  }

  private startsExpr(node: Node | undefined): boolean {
    if (!node) return false;
    if (node.kind === 'lambda') return true;
    if (node.kind !== 'token') return false;
    const word = node.word;
    if (word.kind === 'keyword') return ARITHMETIC.has(word.keyword) || word.keyword === 'input';
    return word.kind !== 'unknown' && word.kind !== 'funcDecl' && word.kind !== 'funcEnd';
  }

  private isComparison(token: Token): boolean {
    return token.word.kind === 'keyword' && COMPARISONS.has(token.word.keyword);
  }

  private integer(value: Value, at: Token): bigint {
    if (typeof value === 'object') throw new UsagiError(`'${at.text}'에는 함수 말고 정수가 필요해`, at);
    return value;
  }

  private arithmetic(op: Keyword, left: Value, right: Value, at: Token): bigint {
    const a = this.integer(left, at);
    const b = this.integer(right, at);
    if (op === 'add') return a + b;
    if (op === 'subtract') return a - b;
    if (op === 'multiply') return a * b;
    if (b === 0n) throw new UsagiError('0으로는 나눌 수 없어', at);
    return a / b;
  }

  private compare(op: Keyword, left: Value, right: Value, at: Token): boolean {
    const a = this.integer(left, at);
    const b = this.integer(right, at);
    if (op === 'equal') return a === b;
    if (op === 'less') return a < b;
    return a > b;
  }

  private char(value: Value, at: Token): string {
    const code = this.integer(value, at);
    if (code < 0n || code > 0x10ffffn) throw new UsagiError(`${code}번 글자는 없어`, at);
    return String.fromCodePoint(Number(code));
  }

  private show(value: Value): string {
    return typeof value === 'bigint' ? value.toString() : value.name;
  }

  private misplaced(token: Token): UsagiError {
    if (token.word.kind === 'unknown') return new UsagiError(`'${token.text}'... 우사기는 그런 말 안 해`, token);
    return new UsagiError(`'${token.text}'만 덩그러니 있어`, token);
  }
}
