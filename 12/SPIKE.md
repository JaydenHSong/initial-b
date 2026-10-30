# S12 스파이크 · 2026-10-29 (America/Los_Angeles)

## 범위와 옵션
- 데이터 소스: https://initialb.vercel.app 갤러리의 공개 제출 기록 하나.
- 도구: `get_gallery_submissions` 하나. 읽기 전용.
- SDK: 공식 `@modelcontextprotocol/server` 2.3.1, TypeScript, Zod.
- 전송: 배포용 Streamable HTTP, 같은 서버의 로컬 stdio 진입점.
- AI 클라이언트: 로그인된 Claude Code. API 키를 새로 수집하거나 저장하지 않음.
- 이번 주: 공개 갤러리 일정 + LA 날짜. S12 0개, S11 3개를 조회함. 0개를 이전 주로 대체하지 않음.

## 성공 판정: 됐다
- Inspector CLI: stdio 도구 목록 1개, S11 실제 호출 3개, HTTP 도구 목록·실제 호출 확인.
- Claude Code + HTTP: 실제 `mcp__gallery__get_gallery_submissions` 호출 입력 `{}`와 S12 0개 결과, 그 결과를 반영한 한국어 답변 확인.
- Claude Code + HTTP: `{ "sprint": "S11" }` 호출, TK LEE / John Kim / Jayden의 실제 프로젝트·스택·리포트에 근거한 답변 확인.
- 완성도 질문: 실제 실행 검증이 없음을 밝히고, 리포트 충실도와 제품 완성도를 구분하며 근거 부족 시 1위를 판정하지 않음.
- 도구 없는 동일 질문: 도구 비활성화, MCP 설정 비움. 제출 내용을 확인하지 못했다고 답함. 공개 시연은 첫 문단만 발췌함. 이후 문단의 로컬 명령 실행 주장은 실제 도구 로그로 뒷받침되지 않으므로 검증 근거로 쓰지 않음.
- 저장된 호출 입력·실제 결과·답변 발췌: `public/docs/demo.html`. 실시간 채팅이 아님을 표시.

## 입력과 실패
- `sprint` 생략 또는 S01~S18. S99는 MCP 도구 응답 `isError: true`로 거절됨.
- 갤러리 HTTP 503·공개 연결 설정 변경을 주입해 실패를 확인함.
- LA 날짜의 S12→S13 경계(11/2 07:59:59Z / 08:00:00Z), 일정 바깥 날짜에서 실패를 확인함.
- 전체 행 수를 Content-Range와 비교해 서버 상한 때문에 일부만 조회되면 전체 비교로 표시하지 않음.
- TypeScript 검사 통과. 팀 문서의 CSS와 data-f 목록이 원본 템플릿과 일치함.

## 기록
- 셋업부터 첫 실제 데이터까지 걸린 시간(분): 기록 없음 (타이머 미사용)
- 막힌 지점 1개: npm 레지스트리 설치 환경의 날짜 제한으로 SDK 2.4.0 설치가 거절됨. 설치 가능한 정식 2.3.1로 고정하고 실제 호출을 검증함.
- 문서 품질: 기록 없음
- 무료 한도: SDK는 오픈 소스. Vercel·Claude 계정별 무료 잔여량은 확인하지 않음.
- 데이터 권한: 갤러리 HTML의 기존 공개 publishable key로 GET 조회만. 서비스 키·DB 변경·쓰기 API 호출 없음.
- 화면: 로컬 소개 페이지 브라우저 표시 확인. 좁은 화면 DOM clientWidth/scrollWidth 모두 375로 가로 넘침 없음.

## 실행과 데모
실행·설정·Inspector 명령은 `README.md`와 `public/docs/setup.html` 참고.
웹 소개·문서는 Vercel `initial-b12`, Root Directory `12`에 배포한다. `/api/mcp`가 원격 MCP 주소다. 갤러리 제출 시에는 사이트 루트 URL을 사용한다.

배포 검증 결과는 아래에 추가한다.

## 첫 Vercel 배포 확인
- https://initial-b12.vercel.app 및 /docs/plan.html, /docs/report.html, /docs/setup.html, /docs/demo.html: HTTP 200.
- 운영 /api/mcp: Inspector 도구 목록 1개, S11 실제 결과 3개 반환.
- Root Directory 12, Node.js 24, enableAffectedProjectsDeployments=true를 Vercel API로 확인. Git 연결은 아직 하지 않았으므로 Git push 자동 배포는 구성하지 않음.
- 첫 배포의 TypeScript 7 함수 변환 과정에서 TS2688 타입 탐색 경고가 발생. 컴파일러를 5.9.3으로 고정해 재배포하고 로그와 운영 호출을 다시 검증한다.

## 최종 배포 검증 완료
- Deployment: dpl_9ueNoEKXnsNCLjDcr4f1trgrMzFn · production · READY
- URL: https://initial-b12.vercel.app
- MCP: https://initial-b12.vercel.app/api/mcp
- Vercel 빌드: TypeScript 5.9.3, Build Completed [14s]. 첫 배포의 TS2688 오류가 최종 빌드 로그에 없음.
- 최종 배포 후 Inspector 재검증: 도구 1개, 이번 주 자동 S12=0개, 명시적 S11=3개.
- 정적 경로 /, /docs/plan.html, /docs/report.html, /docs/setup.html, /docs/demo.html 모두 200.
- Claude Code가 실제 Vercel HTTP 주소의 gallery 도구를 호출하고 S12=0개·판정 불가를 출처와 함께 답함. 최종 배포는 컴파일러 설정만 정리했고 동일한 서버 소스에 대해 Inspector 운영 재검증 완료.
- 최종 배포의 최근 5분 error/fatal 로그 조회: 해당 로그 없음. 별도 모니터링·drain은 구성하지 않음.
- 로컬 12/.mcp.json에 프로젝트용 원격 MCP 설정을 저장함. 원격 연결 설정에 시크릿 없음.
- 소스는 로컬 미커밋 상태에서 직접 업로드해 배포함. Git 커밋·푸시, Git 연동, 갤러리 드랍은 수행하지 않음.

## 2026-10-30 · 게시 및 제출 작업
- 다른 주차의 변경을 보존하기 위해 `codex/s12-gallery-mcp` 브랜치에 `12/`만 커밋한다.
- 공개 문서의 소스 링크를 해당 브랜치의 `12/`로 갱신한다. 기존 배포·검증 기록은 당시 상태를 기록한 것이다.
