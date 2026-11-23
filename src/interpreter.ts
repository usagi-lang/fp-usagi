import { LANGUAGE } from './language.ts';
import { Words } from './words.ts';
import type { Keyword } from './words.ts';
import { parse } from './parser.ts';
import type { Lambda, Node } from './parser.ts';
import type { Token } from './lexer.ts';
import { UsagiError, warning } from './error.ts';
import type { Warning } from './error.ts';

export type IO = {
  write(text: string): void;
  read(): number;
  warn?(warning: Warning): void;
};

type Env = { slot: number; value: Value; next: Env } | null;
type Scope = { table: Map<number, Closure>; parent: Scope | null };
export type Closure = { kind: 'closure'; name: string; params: number[]; body: Node[]; env: Env; scope: Scope };
export type Composed = { kind: 'composed'; name: string; first: Func; then: Func };
export type Builtin = { kind: 'builtin'; name: string; ops: Keyword[]; arity: number; bound: Value[]; at: Token };
export type Func = Closure | Composed | Builtin;
export type List = { kind: 'cons'; head: Value; tail: List } | { kind: 'empty' };
export type Value = bigint | Func | List;

type Outcome =
  | { kind: 'done'; env: Env }
  | { kind: 'return'; value: Value }
  | { kind: 'tail'; fn: Func; args: Value[] };

type Cursor = { nodes: Node[]; i: number };
type Pattern = number | { head: Pattern; tail: Pattern; at: Token };

const EMPTY: List = { kind: 'empty' };
const CALLERS = new Set<Keyword>(['map', 'filter', 'fold', 'pipe']);
const COMPARISONS = new Set<Keyword>(['equal', 'less', 'greater']);
const PRINTS = new Set<Keyword>(['print', 'charPrint', 'textPrint']);
const OPERATORS = new Map<Keyword, number>([
  ['input', 0],
  ['empty', 0],
  ['add', 2],
  ['subtract', 2],
  ['multiply', 2],
  ['divide', 2],
  ['remainder', 2],
  ['cons', 2],
  ['head', 1],
  ['tail', 1],
  ['range', 2],
  ['map', 2],
  ['filter', 2],
  ['fold', 3],
  ['partial', 2],
  ['compose', 2],
  ['pipe', 2],
]);

const overflowed = (err: unknown) =>
  (err instanceof RangeError && err.message.includes('call stack')) || (err instanceof Error && err.name === 'InternalError');

export function run(source: string, io: IO): void {
  new Session(io).run(source);
}

export class Session {
  private io: IO;
  private words = new Words(LANGUAGE);
  private env: Env = null;
  private scope: Scope | null = null;
  private warned = new Set<Token>();

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
      throw overflowed(err) ? new UsagiError(this.tooDeep()) : err;
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
      if (node.kind === 'func') {
        scope.table.get(node.index)!.env = env;
        continue;
      }
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
      } else if (keyword === 'textPrint') {
        this.io.write(this.text(this.expr(cur, env, scope, true), node));
      } else if (keyword === 'return') {
        return this.returns(node, cur) ? this.tail(cur, env, scope) : { kind: 'return', value: 0n };
      } else if (keyword === 'assignment') {
        const pattern = this.pattern(cur, node);
        env = this.bind(pattern, this.expr(cur, env, scope, true), env);
      } else if (COMPARISONS.has(keyword)) {
        const outcome = this.condition(node, cur, env, scope);
        if (outcome) return outcome;
      } else if (this.isStatementOperator(keyword)) {
        cur.i--;
        this.expr(cur, env, scope, true);
      } else {
        throw this.misplaced(node);
      }
    }
    return { kind: 'done', env };
  }

  private condition(first: Token, cur: Cursor, env: Env, scope: Scope): Outcome | null {
    const holds = this.test(first, cur, env, scope, true);
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

  private test(first: Token, cur: Cursor, env: Env, scope: Scope, live: boolean): boolean {
    const ops = [(first.word as { keyword: Keyword }).keyword];
    for (let next = cur.nodes[cur.i]; next?.kind === 'token' && this.isComparison(next); next = cur.nodes[++cur.i]) {
      ops.push((next.word as { keyword: Keyword }).keyword);
    }
    const left = this.expr(cur, env, scope, live);
    const right = this.expr(cur, env, scope, live);
    return live && ops.some((op) => this.compare(op, left, right, first));
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
    if (PRINTS.has(keyword)) {
      this.expr(cur, env, scope, false);
    } else if (keyword === 'return') {
      if (this.returns(node, cur)) this.expr(cur, env, scope, false);
    } else if (keyword === 'assignment') {
      this.pattern(cur, node);
      this.expr(cur, env, scope, false);
    } else if (COMPARISONS.has(keyword)) {
      this.test(node, cur, env, scope, false);
      if (!cur.nodes[cur.i]) throw new UsagiError('조건문 다음에 할 일이 없어', node);
      this.skip(cur, env, scope);
    } else if (this.isStatementOperator(keyword)) {
      cur.i--;
      this.expr(cur, env, scope, false);
    } else {
      throw this.misplaced(node);
    }
  }

  private returns(at: Token, cur: Cursor): boolean {
    const next = cur.nodes[cur.i];
    return this.startsExpr(next) && next!.line === at.line;
  }

  private tail(cur: Cursor, env: Env, scope: Scope): Outcome {
    const node = cur.nodes[cur.i];
    if (node?.kind === 'token') {
      const word = node.word;
      if (word.kind === 'funcCall' || word.kind === 'varCall') {
        cur.i++;
        const fn = this.callee(node, env, scope);
        return { kind: 'tail', fn, args: this.args(fn, node, cur, env, scope, true) };
      }
      if (word.kind === 'keyword' && word.keyword === 'pipe') {
        cur.i++;
        const value = this.expr(cur, env, scope, true);
        return { kind: 'tail', fn: this.function(this.expr(cur, env, scope, true), 1, node), args: [value] };
      }
      if (word.kind === 'keyword' && COMPARISONS.has(word.keyword)) {
        cur.i++;
        if (this.test(node, cur, env, scope, true)) {
          const outcome = this.tail(cur, env, scope);
          this.expr(cur, env, scope, false);
          return outcome;
        }
        this.expr(cur, env, scope, false);
        return this.tail(cur, env, scope);
      }
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
      case 'variable': {
        if (!live) return 0n;
        const value = this.lookup(env, word.slot);
        if (value === undefined) throw this.unbound(node, word.slot);
        return value;
      }
      case 'funcRef':
        return live ? this.find(scope, word.index, node) : 0n;
      case 'funcCall':
      case 'varCall': {
        const fn = this.callee(node, env, scope);
        const args = this.args(fn, node, cur, env, scope, live);
        if (!live) return 0n;
        try {
          return this.call(fn, args);
        } catch (err) {
          throw this.deep(err, node);
        }
      }
      case 'keyword': {
        if (word.keyword === 'reference') {
          const fn = this.reference(node, cur);
          return live ? fn : 0n;
        }
        if (COMPARISONS.has(word.keyword)) return this.choose(node, cur, env, scope, live);
        const arity = OPERATORS.get(word.keyword);
        if (arity === undefined) break;
        const args: Value[] = [];
        for (let k = 0; k < arity; k++) args.push(this.expr(cur, env, scope, live));
        if (!live) return 0n;
        if (!CALLERS.has(word.keyword)) return this.operate(word.keyword, args, node);
        try {
          return this.operate(word.keyword, args, node);
        } catch (err) {
          throw this.deep(err, node);
        }
      }
    }
    if (word.kind === 'unknown') throw new UsagiError(`'${node.text}'... 우사기는 그런 말 안 해`, node);
    throw new UsagiError(`'${node.text}'... 여기엔 값이 와야 해`, node);
  }

  private reference(at: Token, cur: Cursor): Builtin {
    const node = cur.nodes[cur.i];
    const word = node?.kind === 'token' ? node.word : null;
    if (node?.kind === 'token' && this.isComparison(node)) {
      const ops: Keyword[] = [];
      const names: string[] = [];
      for (let next = cur.nodes[cur.i]; next?.kind === 'token' && this.isComparison(next); next = cur.nodes[++cur.i]) {
        ops.push((next.word as { keyword: Keyword }).keyword);
        names.push(next.text);
      }
      return { kind: 'builtin', name: names.join(' '), ops, arity: 2, bound: [], at: node };
    }
    const arity = word?.kind === 'keyword' ? OPERATORS.get(word.keyword) : undefined;
    if (node?.kind !== 'token' || word?.kind !== 'keyword' || !arity) {
      const hint = word?.kind === 'number' ? `. 음수라면 '${at.text}${(node as Token).text}'처럼 붙여 써` : '';
      throw new UsagiError(`'${at.text}' 다음엔 값을 받는 우사기 말이 와야 해${hint}`, node ?? at);
    }
    cur.i++;
    return { kind: 'builtin', name: node.text, ops: [word.keyword], arity, bound: [], at: node };
  }

  private apply(fn: Builtin, args: Value[]): Value {
    const values = [...fn.bound, ...args];
    if (COMPARISONS.has(fn.ops[0])) return fn.ops.some((op) => this.compare(op, values[0], values[1], fn.at)) ? 1n : 0n;
    return this.operate(fn.ops[0], values, fn.at);
  }

  private choose(first: Token, cur: Cursor, env: Env, scope: Scope, live: boolean): Value {
    const holds = this.test(first, cur, env, scope, live);
    const yes = this.expr(cur, env, scope, live && holds);
    const no = this.expr(cur, env, scope, live && !holds);
    return holds ? yes : no;
  }

  private operate(keyword: Keyword, args: Value[], at: Token): Value {
    switch (keyword) {
      case 'input':
        return BigInt(this.io.read());
      case 'empty':
        return EMPTY;
      case 'cons':
        return { kind: 'cons', head: args[0], tail: this.list(args[1], at) };
      case 'head':
        return this.filled(args[0], at, '첫 값이').head;
      case 'tail':
        return this.filled(args[0], at, '나머지가').tail;
      case 'range':
        return this.range(this.integer(args[0], at), this.integer(args[1], at));
      case 'map': {
        const fn = this.function(args[0], 1, at);
        return this.build(this.items(args[1], at).map((item) => this.call(fn, [item])));
      }
      case 'filter': {
        const fn = this.function(args[0], 1, at);
        return this.build(this.items(args[1], at).filter((item) => this.integer(this.call(fn, [item]), at) !== 0n));
      }
      case 'fold': {
        const fn = this.function(args[0], 2, at);
        return this.items(args[2], at).reduce((acc, item) => this.call(fn, [acc, item]), args[1]);
      }
      case 'partial': {
        const fn = this.func(args[0], at);
        if (this.arity(fn) === 0) throw new UsagiError(`'${at.text}'에 넘긴 함수는 매개변수가 1개 이상이어야 해`, at);
        return this.partial(fn, args[1]);
      }
      case 'compose':
        return { kind: 'composed', name: at.text, first: this.func(args[0], at), then: this.function(args[1], 1, at) };
      case 'pipe':
        return this.call(this.function(args[1], 1, at), [args[0]]);
      default:
        return this.arithmetic(keyword, args[0], args[1], at);
    }
  }

  private list(value: Value, at: Token): List {
    if (typeof value === 'object' && (value.kind === 'cons' || value.kind === 'empty')) return value;
    throw new UsagiError(`'${at.text}'에는 목록이 와야 하는데 ${this.kind(value)} 왔어`, at);
  }

  private filled(value: Value, at: Token, part: string): Extract<List, { kind: 'cons' }> {
    const list = this.list(value, at);
    if (list.kind === 'empty') throw new UsagiError(`'${at.text}'... 빈 목록에는 ${part} 없어`, at);
    return list;
  }

  private items(value: Value, at: Token): Value[] {
    const items: Value[] = [];
    for (let list = this.list(value, at); list.kind === 'cons'; list = list.tail) items.push(list.head);
    return items;
  }

  private build(items: Value[]): List {
    let list = EMPTY;
    for (let k = items.length - 1; k >= 0; k--) list = { kind: 'cons', head: items[k], tail: list };
    return list;
  }

  private range(from: bigint, to: bigint): List {
    let list = EMPTY;
    for (let k = to; k >= from; k--) list = { kind: 'cons', head: k, tail: list };
    return list;
  }

  private func(value: Value, at: Token): Func {
    if (this.isFunc(value)) return value;
    throw new UsagiError(`'${at.text}'에는 함수가 와야 하는데 ${this.kind(value)} 왔어`, at);
  }

  private function(value: Value, arity: number, at: Token): Func {
    const fn = this.func(value, at);
    const actual = this.arity(fn);
    if (actual !== arity) throw new UsagiError(`'${at.text}'에 넘긴 함수는 매개변수가 ${arity}개여야 하는데 ${actual}개야`, at);
    return fn;
  }

  private isFunc(value: Value): value is Func {
    return typeof value === 'object' && (value.kind === 'closure' || value.kind === 'composed' || value.kind === 'builtin');
  }

  private arity(fn: Func): number {
    if (fn.kind === 'composed') return this.arity(fn.first);
    return fn.kind === 'closure' ? fn.params.length : fn.arity;
  }

  private args(fn: Func, at: Token, cur: Cursor, env: Env, scope: Scope, live: boolean): Value[] {
    const arity = this.arity(fn);
    const values: Value[] = [];
    while (values.length < arity) {
      const next = cur.nodes[cur.i];
      if (this.ends(next)) throw new UsagiError(`'${at.text}'에 넘길 값이 모자라. 매개변수는 ${arity}개인데 ${values.length}개만 있어`, at);
      this.reaches(at, next);
      values.push(this.expr(cur, env, scope, live));
    }
    return values;
  }

  private ends(node: Node | undefined): boolean {
    return !node || (node.kind === 'token' && node.word.kind === 'keyword' && !this.startsExpr(node));
  }

  private reaches(at: Token, next: Node | undefined): void {
    if (next?.kind !== 'token' || next.line === at.line || next.col !== next.indent || next.indent > at.indent) return;
    if (this.warned.has(at)) return;
    this.warned.add(at);
    this.io.warn?.(warning(`'${at.text}'가 ${next.line}줄의 '${next.text}'까지 인자로 가져갔어. 인자를 빠뜨린 게 아니라면 ${next.line}줄을 더 들여 써`, at));
  }

  private partial(fn: Func, value: Value): Func {
    if (fn.kind === 'composed') return { ...fn, first: this.partial(fn.first, value) };
    if (fn.kind === 'builtin') return { ...fn, arity: fn.arity - 1, bound: [...fn.bound, value] };
    const [slot, ...rest] = fn.params;
    return { ...fn, params: rest, env: { slot, value, next: fn.env } };
  }

  private call(fn: Func, args: Value[]): Value {
    for (;;) {
      if (fn.kind === 'builtin') return this.apply(fn, args);
      if (fn.kind === 'composed') {
        args = [this.call(fn.first, args)];
        fn = fn.then;
        continue;
      }
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

  private callee(token: Token, env: Env, scope: Scope): Func {
    const word = token.word;
    if (word.kind === 'funcCall') return this.find(scope, word.index, token);
    const value = word.kind === 'varCall' ? this.lookup(env, word.slot) : undefined;
    if (word.kind === 'varCall' && value === undefined) throw this.unbound(token, word.slot);
    if (value !== undefined && this.isFunc(value)) return value;
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

  private pattern(cur: Cursor, at: Token, slots: number[] = []): Pattern {
    const node = cur.nodes[cur.i++];
    if (node?.kind === 'token' && node.word.kind === 'keyword' && node.word.keyword === 'cons') {
      return { head: this.pattern(cur, node, slots), tail: this.pattern(cur, node, slots), at: node };
    }
    if (node?.kind !== 'token' || node.word.kind !== 'variable') {
      throw new UsagiError(`'${at.text}' 다음엔 변수나 '${this.words.lang.Cons}'가 와야 해`, node ?? at);
    }
    if (slots.includes(node.word.slot)) throw new UsagiError(`'${node.text}'와 글자 수가 같은 변수가 이미 있어`, node);
    slots.push(node.word.slot);
    return node.word.slot;
  }

  private bind(pattern: Pattern, value: Value, env: Env): Env {
    if (typeof pattern === 'number') return { slot: pattern, value, next: env };
    const list = this.list(value, pattern.at);
    if (list.kind === 'empty') throw new UsagiError(`'${pattern.at.text}'... 빈 목록은 나눠 묶을 수 없어`, pattern.at);
    return this.bind(pattern.tail, list.tail, this.bind(pattern.head, list.head, env));
  }

  private startsExpr(node: Node | undefined): boolean {
    if (!node) return false;
    if (node.kind === 'lambda') return true;
    if (node.kind !== 'token') return false;
    const word = node.word;
    if (word.kind === 'keyword') return OPERATORS.has(word.keyword) || COMPARISONS.has(word.keyword) || word.keyword === 'reference';
    return word.kind !== 'unknown' && word.kind !== 'funcDecl' && word.kind !== 'funcEnd';
  }

  private isStatementOperator(keyword: Keyword): boolean {
    return keyword !== 'empty' && OPERATORS.has(keyword);
  }

  private isComparison(token: Token): boolean {
    return token.word.kind === 'keyword' && COMPARISONS.has(token.word.keyword);
  }

  private integer(value: Value, at: Token): bigint {
    if (typeof value === 'object') throw new UsagiError(`'${at.text}'에는 정수가 와야 하는데 ${this.kind(value)} 왔어`, at);
    return value;
  }

  private kind(value: Value): string {
    if (typeof value === 'bigint') return '정수가';
    return this.isFunc(value) ? '함수가' : '목록이';
  }

  private arithmetic(op: Keyword, left: Value, right: Value, at: Token): bigint {
    const a = this.integer(left, at);
    const b = this.integer(right, at);
    try {
      if (op === 'add') return a + b;
      if (op === 'subtract') return a - b;
      if (op === 'multiply') return a * b;
    } catch (err) {
      if (err instanceof RangeError && !overflowed(err)) throw new UsagiError('수가 너무 커졌어', at);
      throw err;
    }
    if (b === 0n) throw new UsagiError('0으로는 나눌 수 없어', at);
    return op === 'divide' ? a / b : a % b;
  }

  private compare(op: Keyword, left: Value, right: Value, at: Token): boolean {
    if (op === 'equal') return this.same(left, right);
    const a = this.integer(left, at);
    const b = this.integer(right, at);
    return op === 'less' ? a < b : a > b;
  }

  private same(a: Value, b: Value): boolean {
    for (;;) {
      if (typeof a === 'bigint' || typeof b === 'bigint') return a === b;
      if (a.kind === 'builtin' && b.kind === 'builtin') {
        const { bound } = b;
        return a.name === b.name && a.bound.length === bound.length && a.bound.every((value, k) => this.same(value, bound[k]));
      }
      if (this.isFunc(a) || this.isFunc(b)) return a === b;
      if (a.kind === 'empty' || b.kind === 'empty') return a.kind === b.kind;
      if (!this.same(a.head, b.head)) return false;
      a = a.tail;
      b = b.tail;
    }
  }

  private text(value: Value, at: Token): string {
    return this.items(value, at).map((item) => this.char(item, at)).join('');
  }

  private char(value: Value, at: Token): string {
    const code = this.integer(value, at);
    if (code < 0n || code > 0x10ffffn) throw new UsagiError(`${code}번 글자는 없어`, at);
    return String.fromCodePoint(Number(code));
  }

  private show(value: Value): string {
    if (typeof value === 'bigint') return value.toString();
    if (this.isFunc(value)) return value.name;
    const parts: string[] = [];
    for (let list: List = value; list.kind === 'cons'; list = list.tail) parts.push(this.show(list.head));
    return `[${parts.join(', ')}]`;
  }

  private unbound(token: Token, slot: number): UsagiError {
    return new UsagiError(`'${token.text}'... 글자 수가 ${slot}인 변수는 묶은 적이 없어`, token);
  }

  private tooDeep(): string {
    return `너무 깊이 들어갔어. '${this.words.lang.Return}' 바로 뒤에서 부르는 꼬리 호출로 바꾸면 깊이 제한이 없어`;
  }

  private deep(err: unknown, at: Token): unknown {
    try {
      return overflowed(err) ? new UsagiError(this.tooDeep(), at) : err;
    } catch {
      return err;
    }
  }

  private misplaced(token: Token): UsagiError {
    if (token.word.kind === 'unknown') return new UsagiError(`'${token.text}'... 우사기는 그런 말 안 해`, token);
    return new UsagiError(`'${token.text}'만 덩그러니 있어`, token);
  }
}
