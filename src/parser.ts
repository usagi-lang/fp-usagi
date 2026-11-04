import { tokenize } from './lexer.ts';
import type { Token } from './lexer.ts';
import type { Words } from './words.ts';
import { UsagiError } from './error.ts';
import type { Pos } from './error.ts';

export type Block = { kind: 'block'; body: Node[]; line: number; col: number };
export type FuncDecl = { kind: 'func'; index: number; name: string; params: number[]; body: Node[]; line: number; col: number };
export type Lambda = { kind: 'lambda'; params: number[]; body: Node[]; line: number; col: number };
export type Node = Token | Block | FuncDecl | Lambda;

type Closer = { matches: (token: Token) => boolean; word: string; opener: Pos };

export function parse(source: string, words: Words): Node[] {
  const tokens = tokenize(source, words);
  const { BlockEnd } = words.lang;
  let i = 0;

  const isBlockEnd = (token: Token) => token.word.kind === 'keyword' && token.word.keyword === 'blockEnd';
  const isBlockStart = (token: Token | undefined) =>
    token?.word.kind === 'keyword' && token.word.keyword === 'blockStart';

  function params(): number[] {
    const slots: number[] = [];
    for (let token = tokens[i]; token?.word.kind === 'variable'; token = tokens[++i]) {
      if (slots.includes(token.word.slot)) throw new UsagiError(`매개변수 '${token.text}'와 글자 수가 같은 게 이미 있어`, token);
      slots.push(token.word.slot);
    }
    return slots;
  }

  function sequence(closer: Closer | null): Node[] {
    const nodes: Node[] = [];
    while (i < tokens.length) {
      const token = tokens[i++];
      if (closer?.matches(token)) return nodes;
      const word = token.word;
      if (isBlockStart(token)) {
        nodes.push({ kind: 'block', body: sequence({ matches: isBlockEnd, word: BlockEnd, opener: token }), line: token.line, col: token.col });
      } else if (isBlockEnd(token) || word.kind === 'funcEnd') {
        throw new UsagiError(closer ? `'${closer.word}'(으)로 닫아야 하는데 '${token.text}'가 나왔어` : `연 적 없는 '${token.text}'가 나왔어`, token);
      } else if (word.kind === 'keyword' && word.keyword === 'functionStart') {
        nodes.push(fn(token));
      } else {
        nodes.push(token);
      }
    }
    if (closer) throw new UsagiError(`'${closer.word}'(으)로 닫아야 하는데 코드가 끝났어`, closer.opener);
    return nodes;
  }

  function fn(start: Token): Node {
    const name = tokens[i];
    const pos = { line: start.line, col: start.col };
    if (name?.word.kind === 'funcDecl') {
      i++;
      const index = name.word.index;
      const end = words.functionName(index, words.lang.FunctionEndSuffix);
      const ps = params();
      const body = sequence({ matches: (t) => t.word.kind === 'funcEnd' && t.word.index === index, word: end, opener: start });
      return { kind: 'func', index, name: words.functionName(index), params: ps, body, ...pos };
    }
    const ps = params();
    const open = tokens[i];
    if (!isBlockStart(open)) {
      throw new UsagiError(`이름 없는 함수는 매개변수 다음에 '${words.lang.BlockStart}'로 본문을 열어야 해`, open ?? start);
    }
    i++;
    const body = sequence({ matches: isBlockEnd, word: BlockEnd, opener: open });
    return { kind: 'lambda', params: ps, body, ...pos };
  }

  return sequence(null);
}
