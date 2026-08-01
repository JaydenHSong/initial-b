# S01 스파이크 기록

## v2 구현 중 실측 (08.01 밤) — 목요일 리포트 재료

- **microlink 무료 쿼터는 IP당이라 Vercel 함수에서 부르면 즉사한다** (공유 IP 쿼터가 늘 소진 상태). 캡처 호출을 브라우저로 옮기고 서버는 microlink CDN 이미지를 받아 저장만 하는 구조로 해결.
- **Supabase Storage 업로드 RLS는 3중이다**: objects INSERT 정책만으론 부족하고, ① buckets SELECT(버킷 조회) ② objects SELECT(INSERT…RETURNING) 정책까지 있어야 403이 풀린다. DB 레벨 시뮬레이션(set role anon)은 통과하는데 API가 거부해서 원인 찾는 데 가장 오래 걸렸다.
- 프로젝트 개명 시 Vercel 자동 도메인이 재생성돼 이전 도메인이 죽는다. 개명 후 재배포 1회 필요. 최종 도메인: **initialb.vercel.app**

## 스파이크 2 — 2026-08-01 · URL 드랍 구조 (v2 기획)

> 코드: `spike2/` (버릴 코드) · 배포: https://ibd-s01-spike-steel.vercel.app (버릴 프로젝트, **개인 Hobby 스코프** `jaydenhsongs-projects`)
> 처음에 회사 팀 스코프(spigen-webd)로 올렸다가 개인 Hobby로 이전, 팀 쪽 프로젝트는 삭제함.

| 판정 | 결과 | 실측 |
|---|---|---|
| 서버 함수가 외부 사이트 HTML을 fetch | **됐다** | example.com → 200, `<title>` 파싱 성공 |
| 함수 → DB insert, 브라우저 select | **됐다** | insert 201 (행 id 1), 배포 페이지에서 select로 같은 행 표시 |
| 브라우저에 위험 키 노출 없음 | **됐다** | 페이지에는 publishable key만. service key는 스파이크에 아예 없음 |

- 셋업에 걸린 시간: 약 15분 (테이블 생성 → 함수 작성 → 배포 → 판정)
- 배포 시간 실측: **1회 4~5초** (Vercel CLI, 데모에서 말할 숫자)
- 막힌 지점 1개: **Vercel은 배포별 URL·일반 별칭에 인증 보호(302)가 기본으로 걸린다** (팀·개인 Hobby 공통). 공개되는 건 **프로젝트의 프로덕션 도메인뿐** — 이번 스파이크에서는 자동 생성된 `ibd-s01-spike-steel.vercel.app`. 갤러리 URL을 팀에 공유할 때 반드시 프로덕션 도메인으로. 남이 열 수 있는지가 완료 기준이라 실구현에서 중요
- 문서 품질: 상 (Supabase REST · Vercel zero-config 모두 문서대로 동작)
- 무료 한도: Supabase 500MB DB / Vercel Hobby급 팀 플랜 — 카드 수백 장 수준에서 무관

**수요일 구현으로 가져갈 것**
- 스파이크는 편의상 publishable key로 insert했다 (스파이크 테이블에 공개 insert 정책). **실구현은 insert 정책을 빼고 service key를 Vercel env에 넣는다** — service key는 CLI 조회가 정책에 막히므로 Supabase 대시보드에서 복사해 `vercel env add`로
- 정리 대기: `drop table s01_spike_sites` + Vercel `ibd-s01-spike` 프로젝트 삭제 (수요일 실구현 시작할 때)

## 스파이크 1 — 2026-08-01 (토, 더미 CSV로 선행 · v1 기획, 방향 변경으로 폐기)

> 코드: `spike/` (버릴 코드). 판정 대상은 PLAN.md의 리스크 3개.

## 판정

| 리스크 | 판정 | 확인한 것 |
|---|---|---|
| 헤더 위치 | **됐다** | 헤더가 5행(인덱스 4)에 있어도 `스프린트` 행 탐색으로 인식. 뒤에 붙는 빈 행 40줄도 스프린트 칸 기준으로 필터됨 |
| fetch → 렌더 구조 | **됐다** | 더미 CSV에 한 줄 추가 후 새로고침 → 재배포 없이 레코드 3 → 4 반영 |
| CORS (실제 게시 URL) | **미판정** | CSV 게시 URL이 아직 없다. 로컬 http로는 검증 불가 — URL 나오는 즉시 `index.html`의 `CSV_URL` 한 줄 교체해서 재판정 |
| 호스트 빌드 설정 | **미판정** | 「내 옵션」 미확정. 확정 후 빈 페이지 1회 배포로 루트 디렉토리 `01` + `/docs/` 경로 확인 |

- 셋업에 걸린 시간: 약 10분 (xlsx → 더미 CSV 변환 포함)
- 막힌 지점 1개: 시트가 데이터 아래로 48행까지 빈 행을 게시함 — 파싱이 아니라 시트 구조 문제. 필터로 해결
- 문서 품질 / 무료 한도: 호스트 확정 전이라 기록 없음

## 구현으로 가져갈 결론

- CSV 파서는 따옴표 필드만 최소 대응하면 충분 (외부 라이브러리 불필요)
- 헤더는 행 번호 고정이 아니라 `스프린트` 첫 칸 탐색으로 잡는다 — 진행자가 안내문 행을 늘려도 안 깨짐
- 레코드 필터: 첫 칸(스프린트)이 빈 행 제거
