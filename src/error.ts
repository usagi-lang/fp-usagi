export type Pos = { line: number; col: number };
export type Warning = { message: string; pos: Pos };

const where = (pos?: Pos) => (pos ? ` (${pos.line}줄 ${pos.col}칸)` : '');

export class UsagiError extends Error {
  pos: Pos | undefined;

  constructor(message: string, pos?: Pos) {
    super(`하아? 하아?${where(pos)} ${message}`);
    this.name = 'UsagiError';
    this.pos = pos ? { line: pos.line, col: pos.col } : undefined;
  }
}

export function warning(message: string, pos: Pos): Warning {
  return { message: `하아?${where(pos)} ${message}`, pos: { line: pos.line, col: pos.col } };
}
