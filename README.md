# APEX FORMULA

Three.js와 TypeScript로 만든 웹 기반 싱글플레이 포뮬러 레이싱 게임입니다.
메인 화면의 싱글 레이스에서 1·3·5·10랩을 선택합니다. 서킷 선택 후 참가 화면의 슬롯으로 상대 차량을 추가합니다. 기본 0대이며 최대 11대입니다. 1랩은 가속을 마친 상태에서 약 4초간 자동주행하며 출발 신호를 보여준 뒤, 출발선에서 조작과 계측이 시작되며, 나머지는 정지 그리드에서 출발합니다.

[브라우저에서 플레이](https://yjun-pop.github.io/f1/)

## 서킷

몬자, 실버스톤, 스파, 모나코, 스즈카, 인터라고스, 싱가포르, 몬트리올.
`?circuit=monaco`처럼 URL로 서킷을 선택할 수 있습니다.

실제 중심선 자료를 참고한 아케이드 게임으로, 도로 폭·고저차·주변 시설은 단순화했습니다.
게스트 기록과 기기 설정은 브라우저에 저장됩니다. 계정·서버 저장은 Supabase 연결 후 사용할 수 있습니다.
[계정 서버 연결 안내](docs/ACCOUNTS_SETUP.md)를 참고하세요. 새 게임에서 드라이버 생성·아카데미 훈련·평가·팀 계약 후 3경기 시즌을 진행할 수 있습니다.
커리어는 로그인이 필요하며 서버 저장 슬롯 1을 사용합니다. 이어하기는 저장된 커리어가 있을 때만 열립니다. 싱글 레이스는 로그인 없이 이용할 수 있습니다. 주행 중 저장은 지원하지 않아 중단한 세션은 다시 시작합니다. 공개 랭킹·멀티플레이·경영·이적은 아직 지원하지 않습니다.

## 조작

| 키 | 기능 |
|---|---|
| W / ↑, S / ↓ | 가속, 제동 · 정지 후 제동 유지로 후진 |
| A / ←, D / → | 조향 |
| Shift | ERS 부스트 |
| F | 사용 가능한 DRS 열기·닫기 |
| Q / E | 수동 기어 내리기·올리기 |
| T | 자동·수동 변속 전환 |
| C | 운전석·추적 시점 전환 |
| G | 주행선 표시 전환 |
| R | 트랙 복귀 |
| M | 음소거 전환 |
| Esc | 일시정지·재개 |
| Enter | 출발·완주 후 재도전 |

서킷은 꺾쇠 버튼·좌우 방향키·가로 스와이프로 선택합니다.
레이스가 끝나면 결과 화면에서 다시 시작하거나 메인 화면으로 돌아갈 수 있습니다.

## 레이싱 휠

Chrome 또는 Edge에서 **설정 → 레이싱 휠 → 휠 연결 및 보정**을 열어 장치를 선택하고 조향·페달 보정을 저장하세요.
Gamepad API와 지원되는 WebHID/WebUSB 입력을 사용할 수 있습니다. Wired Wheel은
전용 USB 연결 항목을 제공합니다. 다른 앱이 장치를 사용 중이면 Steam 등을 완전히 종료한 뒤 다시 연결하세요.

장치와 연결 모드에 따라 호환성이 다릅니다. 진동은 설정의 테스트로 확인할 수 있으며,
조향 포스피드백은 지원하지 않습니다.

## 로컬 실행

Node.js 버전은 [.nvmrc](.nvmrc)를 따릅니다.

```sh
nvm use
npm ci
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다.

## 빌드와 검사

```sh
npm run build
npm run preview
```

전체 회귀 검사는 `npm test`로 실행합니다. UI만 수정할 때는 다음 검사를 사용합니다.

```sh
node tests/career.mjs
node tests/circuit-menu.mjs
node tests/circuit-backdrop.mjs
node tests/race-session.mjs
```

커리어 화면과 실제 주행 연결 브라우저 검사는 Vite(5180)와 Chromium CDP(9238)를 실행한 상태에서 `node tests/career-browser.mjs`로 확인합니다.

## 배포

`main` 브랜치에 푸시하면 [GitHub Actions](.github/workflows/pages.yml)가 검사·빌드 후
GitHub Pages에 배포합니다. Pages용 빌드 명령은 `npm run build -- --base=/f1/`입니다.

## 자료와 라이선스

서킷 중심선 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.
환경 모델의 참고 자료와 재현 범위는 [서킷 환경 문서](docs/CIRCUIT_AUTHENTICITY.md)를 참고하세요.
