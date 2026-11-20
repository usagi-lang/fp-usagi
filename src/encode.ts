import { LANGUAGE } from './language.ts';

const SMALL = 12n;

export function encodeNumber(n: bigint): string {
  if (n < 0n) {
    return -n <= SMALL ? LANGUAGE.Negative + encodeNumber(-n) : `${LANGUAGE.Subtract} ${LANGUAGE.Number} ${encodeNumber(-n)}`;
  }
  if (n <= SMALL) return LANGUAGE.Number + '!'.repeat(Number(n));
  const a = isqrt(n);
  const b = n / a;
  const r = n - a * b;
  const product = `${LANGUAGE.Multiply} ${encodeNumber(a)} ${encodeNumber(b)}`;
  return r === 0n ? product : `${LANGUAGE.Add} ${product} ${encodeNumber(r)}`;
}

export function encodeList(text: string): string {
  const items = [...text].map((ch) => `${LANGUAGE.Cons} ${encodeNumber(BigInt(ch.codePointAt(0)!))}`);
  return [...items, LANGUAGE.Empty].join('\n');
}

export function encodeText(text: string): string {
  const lines = text.match(/[^\n]*\n|[^\n]+/g) ?? [];
  return lines.map((line) => `${LANGUAGE.TextPrint}\n${encodeList(line)}\n`).join('\n');
}

function isqrt(n: bigint): bigint {
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}
