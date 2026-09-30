# 모음 — 팔레트 스튜디오

선택한 두 번째 목업을 바탕으로 만든 이미지 팔레트 사이트입니다.

- 이미지 선택 또는 드래그 → 대표색 5개 추출 → 보드에 추가
- 이미지 URL 붙여넣기 또는 링크 드롭 → 같은 추출·저장 흐름
- 색상 행 클릭 → HEX 복사 및 완료 표시
- 아래 카드 선택 → 사진과 색상 다시 열기
- 직접 올린 팔레트는 이 브라우저의 IndexedDB에 저장
- 3개의 시작 카드는 목업용 예시이며 실제 업로드와 구분해서 표시

React + Vite / Color Thief 3.5 / Phosphor Icons / 로컬 Noto Sans KR.

`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`

`npm run build` → dist/client.

## Vercel 배포

- 공개 사이트: https://initial-b09.vercel.app
- 개인 팀: `jaydenhsongs-projects`
- 프로젝트: `initial-b09` (`prj_xYKfvNDrdjbGVM7UUMCXJ0RJuDnF`)
- Vercel Root Directory: `09`
- 빌드: `npm run build`, 설치: `npm ci`, 출력: `dist/client`
- 기존 `palette-studio/` 폴더를 `09/`로 이동했습니다.
- 최초 배포는 `09` 소스만 포함한 임시 상위 폴더에서 CLI로 진행했습니다. 부모 저장소의 `.vercel/project.json`은 기존 `initial-b02` 연결이므로 그 상태에서 무심코 배포하지 마세요. 재배포 시에도 `09`만 포함한 상위 경로를 `initial-b09` 프로젝트에 연결하고 실행하세요.
- Git 저장소 연결 및 자동 배포는 아직 설정하지 않았습니다.
- 팀 갤러리: https://initialb.vercel.app — `09/public/docs/plan.html`, `09/public/docs/report.html`을 배포하고 사이트 URL을 등록했습니다. 비교표의 미측정 항목은 비워두었습니다.

사진은 JPG/PNG/WEBP, 최대 20MB. 저장용 이미지는 긴 변 최대 1600px로 조정합니다. 색이 매우 적으면 존재하는 색을 반복하고 안내를 표시합니다. 브라우저 데이터를 지우면 저장한 팔레트도 사라집니다. 기기 간 동기화는 없습니다.

URL은 이미지 자체의 공개 HTTP(S) 주소를 지원합니다. 일반 웹페이지는 지원하지 않으며, 원본 사이트가 CORS 접근을 허용해야 합니다. 쿠키 없이 요청하고, 15초 제한 및 스트리밍 20MB 제한을 적용합니다. 접근이 차단되면 파일 업로드 방법을 안내합니다.

URL 처리 회귀 검증: `node --test tests/remote-image.test.mjs`.

## 디자인과 검증

선택한 원본: `qa/reference.png`. 전체 비교: `qa/comparison-final.jpg`. 검증 기록: `design-qa.md`.

## 이미지 생성 기록

세 사진은 built-in Image Gen으로 선택한 목업을 참조해 각각 생성했고, 앱에서 사용하는 최종 파일은 아래에 저장했습니다. 간결하게 정리한 최종 프롬프트:

- `public/assets/summer-house.png`: Landscape editorial Mediterranean architecture photo, peach plaster building, cobalt arched door, potted olive tree, pale stone steps and deep blue sea to the right. Match reference composition and natural sunlight. Photo only, no UI or text; target aspect 1.63.
- `public/assets/ceramic.png`: Landscape editorial still life, sage ceramic pitcher, olives and olive branches, natural linen, warm plaster wall, soft window light; earthy sage/olive/beige/charcoal palette. Photo only, no UI or text; target aspect 1.63.
- `public/assets/coast.png`: Landscape editorial Greek coast photo, azure caldera, pale blue sky, distant headland, white buildings on sunlit beige cliff at right, bougainvillea accent. Photo only, no UI or text; target aspect 1.63.

Original generated assets remain preserved. Images are illustrative examples, not externally sourced photography.
