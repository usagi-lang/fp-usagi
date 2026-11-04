export type Pos = { line: number; col: number };

export class UsagiError extends Error {
  pos: Pos | undefined;

  constructor(message: string, pos?: Pos) {
    const where = pos ? ` (${pos.line}줄 ${pos.col}칸)` : '';
    super(`하아? 하아?${where} ${message}`);
    this.name = 'UsagiError';
    this.pos = pos ? { line: pos.line, col: pos.col } : undefined;
  }
}
