export type TourItem = { title: string; text: string; code: string; result: string };
export type Entry = { word: string; meaning: string; snippet: string };

const lines = (...rows: string[]) => rows.join('\n') + '\n';

export const TOUR: TourItem[] = [
  {
    title: '숫자',
    text: '`야하` 뒤에 붙은 `!`의 개수가 숫자입니다. 앞에 `이`를 하나 붙일 때마다 부호가 바뀝니다.',
    code: lines('미이이야하 야하!!!', '미이이야하 이야하!!!'),
    result: '3, -3',
  },
  {
    title: '변수',
    text: '`우`로 시작하고 `우`·`라`·`아`로만 된 말이 변수입니다. 글자 수로만 구분해서 `우라`, `우아`, `우우`는 같은 변수입니다. `미야아아`로 값을 묶습니다.',
    code: lines('미야아아 우라 야하!!!!!', '미이이야하 우아'),
    result: '5',
  },
  {
    title: '계산',
    text: '연산자를 앞에 씁니다. `푸릿`(+), `푸리릿`(−), `푸리리릿`(×), `푸리리리릿`(÷)입니다.',
    code: lines('미이이야하 푸리리릿 야하!!! 푸릿 야하!! 야하!!!!'),
    result: '18',
  },
  {
    title: '조건',
    text: '`푸루`(같다), `푸루루`(작다), `푸루루루`(크다) 뒤에 두 값을 쓰면, 참일 때 다음 문장 하나나 `하!` … `하?` 블록을 실행합니다. 비교 말을 이어 쓰면 OR가 됩니다.',
    code: lines('푸루 푸루루 야하!! 야하!!! 하!', '  미이이야하 야하!', '하?'),
    result: '1',
  },
  {
    title: '함수',
    text: '`우라-야하!` 다음에 이름(`하아!`, `하아아!` …)과 매개변수를 쓰고 `하아?`로 닫습니다. 부를 때는 `하아-`, 값을 돌려줄 때는 `푸루야`를 씁니다.',
    code: lines('우라-야하! 하아! 우', '푸루 우 야하 푸루야 야하!', '푸루야 푸리리릿 우 하아- 푸리릿 우 야하!', '하아?', '', '미이이야하 하아- 야하!!!!!'),
    result: '120',
  },
  {
    title: '함수를 값으로',
    text: '`-` 없이 `하아`라고만 쓰면 함수 자체를 가리킵니다. 변수에 담은 함수는 `우-`처럼 불러서, 함수를 받는 함수를 만들 수 있습니다.',
    code: lines('우라-야하! 하아! 우 우라', '푸루야 우- 우- 우라', '하아?', '', '우라-야하! 하아아! 우', '푸루야 푸릿 우 야하!!!', '하아아?', '', '미이이야하 하아- 하아아 야하!!!!!!!!!!'),
    result: '16',
  },
  {
    title: '이름 없는 함수',
    text: '`우라-야하!` 뒤에 이름 없이 매개변수를 쓰고 `하!` … `하?`로 본문을 감쌉니다. 값이 들어갈 자리면 어디든 쓸 수 있습니다.',
    code: lines('미야아아 우라 우라-야하! 우 하! 푸루야 푸리리릿 우 우 하?', '미이이야하 우라- 야하!!!!!!!!!'),
    result: '81',
  },
  {
    title: '클로저',
    text: '함수는 만들어질 때의 값을 기억합니다. 나중에 `우`를 10으로 다시 묶어도 함수는 3을 씁니다.',
    code: lines('미야아아 우 야하!!!', '미야아아 우라 우라-야하! 우우우 하! 푸루야 푸리리릿 우 우우우 하?', '미야아아 우 야하!!!!!!!!!!', '미이이야하 우라- 야하!!'),
    result: '6',
  },
  {
    title: '바뀌지 않는 값',
    text: '`미야아아`는 원래 값을 고치지 않고 같은 이름을 새로 묶어 가립니다. 블록 안에서 묶은 값은 블록이 끝나면 사라집니다.',
    code: lines('미야아아 우 야하!', '푸루 야하 야하 하!', '  미야아아 우 야하!!', '  미이이야하 우', '하?', '미이이야하 우'),
    result: '2, 1',
  },
];

export const DICTIONARY: Entry[] = [
  { word: '야하!!!', meaning: '정수 (`!` 개수)', snippet: '야하!!!' },
  { word: '이야하!', meaning: '부호 바꾸기', snippet: '이야하!' },
  { word: '우라', meaning: '변수 (글자 수로 구분)', snippet: '우라' },
  { word: '미야아아', meaning: '묶기', snippet: '미야아아 우 야하!' },
  { word: '미이이야하', meaning: '정수 출력', snippet: '미이이야하 ' },
  { word: '미이이이야하', meaning: '글자 출력', snippet: '미이이이야하 ' },
  { word: '야푸', meaning: '입력 한 글자 읽기', snippet: '야푸' },
  { word: '푸릿', meaning: '더하기', snippet: '푸릿 ' },
  { word: '푸리릿', meaning: '빼기', snippet: '푸리릿 ' },
  { word: '푸리리릿', meaning: '곱하기', snippet: '푸리리릿 ' },
  { word: '푸리리리릿', meaning: '나누기 (0 쪽으로 버림)', snippet: '푸리리리릿 ' },
  { word: '푸루', meaning: '같다', snippet: '푸루 ' },
  { word: '푸루루', meaning: '작다', snippet: '푸루루 ' },
  { word: '푸루루루', meaning: '크다', snippet: '푸루루루 ' },
  { word: '하! 하?', meaning: '블록', snippet: '하!\n  \n하?' },
  { word: '우라-야하! 하아! 하아?', meaning: '함수 선언', snippet: '우라-야하! 하아! 우\n푸루야 우\n하아?\n' },
  { word: '하아-', meaning: '함수 호출', snippet: '하아- ' },
  { word: '하아', meaning: '함수 값', snippet: '하아' },
  { word: '우-', meaning: '변수에 담긴 함수 호출', snippet: '우- ' },
  { word: '우라-야하! 우 하! 하?', meaning: '이름 없는 함수', snippet: '우라-야하! 우 하! 푸루야 우 하?' },
  { word: '푸루야', meaning: '값 돌려주기', snippet: '푸루야 ' },
  { word: '#', meaning: '주석', snippet: '# ' },
];
