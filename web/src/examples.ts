const files = import.meta.glob('../../examples/*.yaha', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export type Example = { id: string; title: string; input: string; source: string };

const LIST: Omit<Example, 'source'>[] = [
  { id: 'twice', title: '두 번 적용하기', input: '' },
  { id: 'hello', title: 'Hello, world!', input: '' },
  { id: 'factorial', title: '팩토리얼', input: '' },
  { id: 'fibonacci', title: '피보나치', input: '' },
  { id: 'list', title: '함수로 만든 목록', input: '' },
  { id: 'fizzbuzz', title: '피즈버즈', input: '' },
  { id: 'echo', title: '메아리 (입력 사용)', input: '야하! 우라~\n' },
];

export const EXAMPLES: Example[] = LIST.map((example) => ({
  ...example,
  source: files[`../../examples/${example.id}.yaha`] ?? '',
}));
