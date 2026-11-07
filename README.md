# DipLog

규칙대로 분할 매수하고, 규칙에서 벗어날 때는 이유를 남기는 개인용 매매 일정 앱 (iPhone 홈 화면 웹앱).
기능 명세는 [SPEC.md](SPEC.md).

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 계산 로직 테스트
npm run build    # dist/ 생성
```

같은 와이파이의 iPhone에서 미리 보려면 `npm run dev` 출력의 `Network:` 주소로 접속한다.
(홈 화면 설치와 오프라인 동작은 HTTPS 주소에서만 된다 → 아래 배포)

## iPhone에 설치 (GitHub Pages)

1. GitHub에 새 저장소를 만든다 (예: `diplog`, Private도 가능하나 Pages는 무료 계정에서 Public 저장소만 지원).
2. 이 폴더를 그 저장소의 `main` 브랜치로 push 한다.
3. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꾼다.
4. Actions가 끝나면 `https://<아이디>.github.io/diplog/` 주소가 생긴다.
5. iPhone Safari로 그 주소를 열고 **공유 → 홈 화면에 추가**.

이후 `main`에 push 할 때마다 자동으로 다시 배포된다. 앱을 다시 열면 새 버전이 적용된다.

## 데이터

- 매매 데이터는 폰 Safari 저장소(localStorage `diplog:v1`)에만 있다. 서버로 가지 않는다.
- **설정 → JSON 내보내기**로 백업한다. iPhone에서는 공유 시트가 열리니 **"파일에 저장"**을 고른다.
- 마지막 백업 후 7일이 지나면 오늘 화면에 알림이 뜬다.
- 홈 화면 앱과 Safari 탭은 저장소가 따로다. 처음부터 홈 화면 앱으로 쓰고, 옮길 때는 내보내기/가져오기를 쓴다.

## 아이콘

`npm run icons` → `public/icon-*.png` 다시 생성 (`scripts/make-icons.mjs`).
