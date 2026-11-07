# 계정 서버 연결

프론트엔드는 GitHub Pages를 유지하고, Supabase Auth와 PostgreSQL에 계정·기록을 저장합니다.
현재 프로젝트 URL과 공개 키가 비어 있으므로 운영 서버의 가입·로그인은 아직 활성화되지 않습니다.

## 최초 연결

1. https://supabase.com/dashboard 에서 본인 소유의 새 프로젝트를 만듭니다. 데이터베이스 비밀번호는 관리자만 보관합니다.
2. SQL Editor에서 [001_accounts.sql](../supabase/migrations/001_accounts.sql)을 한 번 실행합니다.
3. Authentication → Providers에서 Email을 켜고 이메일 인증을 유지합니다. 비밀번호 최소 길이는 10자 이상을 권장합니다.
4. Authentication → URL Configuration의 Site URL을 `https://yjun-pop.github.io/f1/`로 지정하고, Redirect URLs에도 같은 주소를 허용합니다. 로컬 테스트 시 `http://localhost:5173/`와 실제 개발 포트를 별도로 허용합니다.
5. 프로젝트 Settings의 API 항목에서 프로젝트 URL과 **publishable key**를 확인해 [account-config.json](../public/account-config.json)의 `supabaseUrl`, `publishableKey`에 넣습니다. 기존 프로젝트의 `anon` 공개 키도 허용합니다. 이 두 값은 브라우저에 공개됩니다. `service_role`, `sb_secret_` 키나 DB 비밀번호는 절대 넣지 않습니다.
6. 빌드·배포 후 두 개의 테스트 계정으로 가입, 이메일 인증, 로그인, 비밀번호 재설정, 로그아웃, 다른 기기의 기록 복원을 확인합니다. PKCE 이메일 링크는 요청했던 브라우저에서 여는 것이 기본입니다.

Supabase 기본 이메일 발송은 테스트 제한이 있습니다. 공개 운영 전 본인 발송 도메인/SMTP를 연결하고 Auth의 가입·로그인·이메일 발송 제한과 CAPTCHA를 설정합니다. 프로젝트 비용과 이용 한도는 Supabase 대시보드에서 관리합니다.

## 저장 범위

- 이메일·암호 검증과 세션 만료/갱신은 공식 Supabase Auth SDK가 처리합니다. 게임은 비밀번호를 따로 저장하거나 로그로 남기지 않습니다.
- `driver_profiles`: 계정별 표시 이름. 로그인 이메일은 게임 공개 테이블에 저장하지 않습니다.
- `race_records`: 서킷별 개인 최고 랩. 로그인한 본인만 읽을 수 있고, 저장 함수는 JWT의 사용자 ID를 사용합니다. 동시 업로드는 더 빠른 기록을 보존합니다.
- `career_saves`: 다음 커리어 단계에서 사용하는 3개 슬롯의 저장 기반. `{ "version": 1, ... }` JSON과 revision으로 저장하며, 오래된 revision의 덮어쓰기는 거부합니다. 현재 게임에 커리어 플레이가 구현된 것은 아닙니다.
- 게스트·계정 A·계정 B의 로컬 캐시는 분리합니다. 게스트 기록을 계정에 합치는 것은 사용자가 ‘게스트 기록 가져오기’를 눌렀을 때뿐입니다.
- 로그인 후 기록을 내려받고, 랩 기록을 갱신하면 서버에 자동 저장합니다. 실패하면 계정별 기기 캐시를 유지하고 계정 창에서 실패 상태를 보여줍니다. 온라인 복귀 또는 ‘서버 기록 다시 확인’으로 재시도합니다.
- 휠 보정과 그래픽·음량 설정은 기기별 브라우저 설정으로 유지합니다.

공개 랭킹과 타인 기록 조회는 다음 단계입니다. 클라이언트가 제출하는 랩타임은 경쟁용 검증 기록이 아니며, 공개 랭킹 전에 주행 검증이 필요합니다.

## 검증

`node tests/account-storage.mjs`: 게스트/계정 분리, 더 빠른 값 유지, 비밀 키 거부.
`node tests/account-service.mjs`: 모의 인증/서버를 이용한 로그인·복원·동기화·계정 전환·실패 처리.
`bash tests/account-database.sh`: 격리된 PostgreSQL 컨테이너에서 실제 RLS·쓰기 권한·동시 저장 규칙 검사(Docker 필요).
`node tests/account-browser.mjs`: Vite와 Chromium CDP를 실행한 뒤 연결 미설정 화면과 진입·복귀 검사.
빌드 전 공개 설정 검사가 실행되며 secret/service_role 키는 빌드를 중단합니다.
실제 이메일 발송·운영 Auth·배포된 RLS는 Supabase 프로젝트 연결 후 별도로 확인해야 합니다.
