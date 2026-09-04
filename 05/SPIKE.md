# S05 스파이크 기록

## Supabase Auth + RLS 격리 — **됐다** (2026-09-03 밤)

**판정 질문:** ① Auth 계정 2개로 RLS가 남의 행을 실제로 막나 ② RLS 켠 상태에서
폴링(로그인 JWT)은 내 행만 받고, service key 수집 경로는 여전히 쓰나.

**방법:** Google 프로바이더 없이 판정했다 — RLS 역학은 신원 공급자와 무관하므로,
스파이크 계정 2개(spike-a/b@spigen.com)를 SQL로 시드하고 비밀번호 로그인으로
**진짜 JWT**를 받아 PostgREST에 직접 쐈다. UI 없음, 버릴 데이터.

| # | 판정 | 결과 |
|---|---|---|
| 1 | A의 JWT로 products 조회 | A 것 1행만 |
| 2 | B의 JWT로 조회 | B 것 1행만 |
| 3 | 비로그인(anon key만) | **빈 배열** |
| 4 | A로 JOIN(products + price_checks 임베드) | A 제품 + A의 관측 2건만 — JOIN도 RLS 스코프 안 |
| 5 | A(로그인 유저)가 INSERT 시도 | **HTTP 403** — 쓰기 정책 없음, 쓰기는 service key뿐 |
| 6 | A가 B의 price_checks를 asin으로 직접 조회 | **빈 배열** |

service key의 RLS 우회는 별도 판정 생략 — s04_products가 읽기 정책만 있는 RLS 상태로
일주일 내내 service key 수집 함수가 써온 프로덕션 실증이 있다 (Supabase 계약대로 동작).

**스키마 확정 (테이블 3 + JOIN + RLS):** `s05_workspaces`(owner unique → 1인 1보드) /
`s05_products`(PK = workspace_id+asin) / `s05_price_checks`(append-only 관측 로그).
정책은 "owner reads" 3개, 쓰기 정책 0개.

**셋업 시간:** 약 25분 (테이블+정책 생성 → 시드 → JWT 발급 → 판정 6종)

**막힌 지점 1개 — 수동 시드한 auth.users는 로그인이 500으로 죽는다.**
`"Database error querying schema"` — GoTrue가 `confirmation_token` 등 토큰 컬럼을
NOT NULL 문자열로 스캔하는데 수동 INSERT는 NULL로 들어간다. 빈 문자열로 채우니
바로 풀렸다. (구현에는 영향 없음 — 실사용 계정은 GoTrue가 만든다)

**덤 발견:** 팀 공유 Supabase의 auth.users에 **`@spigen.com`만 허용하는 트리거**가
이미 걸려 있다 (`enforce_spigen_email`). 수요일 Google 로그인도 이 제약을 받는다 —
사내 도구엔 오히려 맞는 방향. 스파이크 이메일도 @spigen.com으로 시드해야 했다.

**문서 품질:** 상 — RLS 정책·PostgREST 임베드·인증 헤더 규약 전부 문서대로 동작.

**무료 한도:** Auth MAU 5만·DB 500MB (Free) — 팀 규모 무관.

**정리 필요:** 스파이크 계정 2개(spike-a/b@spigen.com)와 시드 행(B0TESTAAA1/BBB1)은
목요일 제출 전에 지운다. 데모 데이터는 실제 로그인+드랍 흐름으로 넣는다.

**남은 사용자 작업:** Supabase 대시보드 → Auth → Providers → **Google 켜기**
(S03 때 GCP OAuth 클라이언트 재사용 + Supabase 콜백 URL 등록). RLS 판정과 무관한
설정 작업이라 스파이크에서 제외했다.
