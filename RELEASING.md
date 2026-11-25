# 새 버전 내기

언어의 문법이나 동작이 바뀌면 아래 순서대로 챙깁니다. 대부분은 `pnpm test`가 빠뜨린 곳을 찾아 줍니다.

## 1. 바꾸는 동안

문법을 더하거나 바꿀 때는 아래 파일을 함께 고칩니다.

| 무엇 | 파일 | 테스트가 잡아 주나요 |
|---|---|---|
| 키워드 | [src/language.ts](src/language.ts), [src/words.ts](src/words.ts) | |
| 동작 | [src/interpreter.ts](src/interpreter.ts) | |
| 문법 색 | [web/src/highlight.ts](web/src/highlight.ts) | `pnpm typecheck`가 빠진 키워드를 잡습니다 |
| 사전 | [web/src/docs.ts](web/src/docs.ts)의 `DICTIONARY`, [README.md](README.md)의 사전 표 | 모든 키워드가 두 곳에 있는지 봅니다 |
| 둘러보기 | `docs.ts`의 `TOUR`, README의 둘러보기 | 적힌 결과와 실제 출력이 같은지 봅니다 |
| 명세 | README의 문장 · 식 · 평가 규칙 표 | |
| 예제 | [examples/](examples), [web/src/examples.ts](web/src/examples.ts), README의 예제 표 | 모든 예제가 오류 없이 돌고, 세 곳에 다 있는지 봅니다 |
| 테스트 | [test/usagi.test.ts](test/usagi.test.ts) | |
| 바뀐 점 | [CHANGELOG.md](CHANGELOG.md)의 `## 다음 버전` | |

전에 돌던 코드가 다르게 돌게 되면 CHANGELOG의 **변경** 항목에 적고, 어떻게 고치면 되는지도 씁니다.

## 2. 버전 정하기

[유의적 버전](https://semver.org/lang/ko/)을 따릅니다. 1.0 전에는 이렇게 올립니다.

- 문법이 늘거나 바뀜: 가운데 자리 (`0.2.0` → `0.3.0`)
- 버그 수정, 문서, 플레이그라운드만 바뀜: 끝자리 (`0.2.0` → `0.2.1`)

## 3. 버전 올리기

1. [package.json](package.json)의 `version`을 고칩니다. `ura --version`, 대화형 모드, 플레이그라운드가 모두 이 값을 씁니다.
2. CHANGELOG의 `## 다음 버전` 아래 내용을 `## [0.3.0] - 2026-12-01`처럼 새 제목 아래로 옮기고, 빈 `## 다음 버전`을 맨 위에 다시 둡니다.
3. 파일 맨 아래에 `[0.3.0]: https://github.com/usagi-lang/fp-usagi/releases/tag/v0.3.0` 링크를 더합니다.
4. 릴리스 노트가 잘 나오는지 봅니다.

```bash
pnpm release:notes
```

5. 테스트와 타입 검사를 돌립니다.

```bash
pnpm test && pnpm typecheck
```

## 4. 내보내기

버전을 올린 커밋을 `main`에 올리고 태그를 답니다.

```bash
git tag v0.3.0
```

```bash
git push origin main v0.3.0
```

- `main`에 올라가면 [pages.yml](.github/workflows/pages.yml)이 플레이그라운드를 다시 배포합니다.
- 태그가 올라가면 [release.yml](.github/workflows/release.yml)이 테스트를 돌리고, CHANGELOG의 해당 버전 내용으로 GitHub 릴리스를 만듭니다. 태그와 `package.json` 버전이 다르면 멈춥니다.

## 미리보기 그림 바꾸기

링크를 붙였을 때 뜨는 카드 그림은 [web/public/og.png](web/public/og.png)입니다. [scripts/og-card.html](scripts/og-card.html)을 고친 뒤 1200×630 크기로 찍어서 덮어씁니다. macOS의 Chrome이라면 아래 명령으로 찍을 수 있습니다.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --window-size=1200,630 --virtual-time-budget=8000 --screenshot="$PWD/web/public/og.png" "file://$PWD/scripts/og-card.html"
```

SNS는 카드 그림을 한동안 저장해 두므로, 바꾼 그림이 바로 보이지 않을 수 있습니다.

## 5. 내보낸 뒤

- [플레이그라운드](https://usagi-lang.github.io/fp-usagi/) 아래쪽 버전이 바뀌었는지 봅니다.
- 새 문법을 쓴 예제를 플레이그라운드에서 한 번 돌려 봅니다.
- 전에 만든 공유 링크가 그대로 열리는지 하나쯤 확인합니다.
