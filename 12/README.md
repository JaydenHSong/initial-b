# S12 · Gallery MCP

팀 initial-B 갤러리의 실제 제출물을 Claude에 연결하는 읽기 전용 도구 하나.

- 도구: `get_gallery_submissions({ sprint?: "S01" ... "S18" })`
- 컴파일러: TypeScript 5.9.3 (Vercel 배포 호환성 확인)
- SDK: `@modelcontextprotocol/server` 2.3.1, TypeScript, Zod
- 전송: Vercel Streamable HTTP (`/api/mcp`), 로컬 stdio
- AI 클라이언트: Claude Code (실제 호출로 검증)
- 데이터: 갤러리의 공개 `sites` 조회. 공개 홈페이지의 일정과 publishable key만 사용하며 서비스 키는 읽지 않는다.
- 이번 주: 갤러리 일정 + `America/Los_Angeles` 날짜. 제출 0개를 이전 주차로 대체하지 않는다.
- 비교: 공개 제출 메타데이터와 누락 필드만 제공. 제품 기능·화면·소스·MCP 실행 평가나 객관적 완성도 순위가 아니다.

```sh
npm ci
npm run build
npm run inspect:list
npm run inspect:call
npm run dev # http://127.0.0.1:3012
```

```sh
claude mcp add --transport http gallery https://initial-b12.vercel.app/api/mcp
```

`12/.mcp.json`에도 원격 연결 설정이 있다. Claude Code를 `12/`에서 열면 프로젝트 MCP 설정으로 사용할 수 있다.

로컬 stdio 연결은 `public/docs/setup.html` 참고. CLI 경로는 각자의 절대 경로를 사용한다. stdout에 로그를 추가하지 않는다.

Vercel: `initial-b12`, 개인 팀 `jaydenhsongs-projects`, Root Directory `12`, output `public`, Node.js 24. 다른 주차 및 부모 `.vercel/project.json`을 변경하지 않는다. 공개된 데이터만 읽으며 별도 시크릿이나 인증 기능은 없다. 쓰기·수정·삭제 도구, 자체 채팅 UI, 다른 데이터 소스는 만들지 않는다.

`public/docs/plan.html`과 `report.html`은 팀 템플릿 CSS·data-f를 보존한다. 확인하지 않은 수치·평가는 `기록 없음`으로 둔다. 실제 검증 기록은 `SPIKE.md`, 시연은 `/docs/demo.html`에 있다.

S12 게시 브랜치: `codex/s12-gallery-mcp`. 소스: https://github.com/JaydenHSong/initial-b/tree/codex/s12-gallery-mcp/12
