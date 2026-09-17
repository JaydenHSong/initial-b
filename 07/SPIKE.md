# S07 스파이크 기록

## 1. 브라우저 → Supabase Storage 직접 업로드 — **됐다** (2026-09-16)

**판정 질문:** 01 갤러리는 서버 함수가 Storage에 올렸다. 이번엔 브라우저가 anon 키로
공개 버킷에 직접 올려도 되나? 올린 파일이 공개 URL로 읽히나? 남의 버킷·삭제는 막히나?

**방법:** 버킷 `s07-receipts`(public, 10MB, 이미지 MIME만) + `storage.objects` 정책 2개
(anon INSERT는 이 버킷만 · SELECT 공개). 브라우저가 보내는 것과 같은 REST 호출을 curl로.

| 판정 | 결과 |
|---|---|
| anon 키로 `POST /storage/v1/object/s07-receipts/…` | **200** |
| 공개 URL `GET /object/public/s07-receipts/…` | **200** · image/png |
| anon이 갤러리 `shots` 버킷에 업로드 | 400 (막힘 — 정책이 버킷 단위로 잘 잡혔다) |
| anon이 올린 파일 DELETE | 400 (막힘 — 덮어쓰기·삭제 정책 없음) |

**셋업 시간:** 약 5분 (마이그레이션 1개 + curl 4회). 서버 경유 없이 브라우저→Storage가 바로 되므로
분석 함수는 이미지 URL만 받으면 된다 — Vercel 함수 본문 크기 한도와 무관.

**막힌 지점 1개:** 없음. **문서 품질:** 상 (버킷 정책은 `bucket_id = '…'` 한 줄).
**무료 한도:** Storage 1GB · 전송 2GB/월 (Free) — 영수증 수십 장은 무관.

## 2. Google Vision이 실물 영수증을 읽나 — **됐다** (2026-09-16 밤)

**판정 질문:** 폰으로 찍은 미국 영수증 사진에서 Vision(DOCUMENT_TEXT_DETECTION)이
날짜·총액·가게명이 담긴 텍스트를 돌려주나?

**방법:** v0 화면(파일 선택 → Storage 직접 업로드 → `/api/spike-vision`)으로 Jayden이 실물
3장을 올렸다. 함수는 Storage URL을 받아 이미지를 base64로 Vision REST에 보낸다(API 키는 env).

| 영수증 | 크기 | 글자 | Vision | 가게명(첫 줄) | 날짜 검출 | TOTAL 줄 |
|---|---|---|---|---|---|---|
| Whole Foods | 2.5MB | 932자 · 52줄 | 2.0초 | WHOLE FOODS / MARKET | 09/15/2026 | "Total:" (금액은 다음 줄) |
| Ralphs | 2.3MB | 725자 · 45줄 | 1.7초 | Ralphs | 09/09/26 | "REF#: 073609 TOTAL: 16.49" |
| Costco | 6.3MB | 769자 · 61줄 | 4.1초 | COSTCO / WHOLESALE | 08/19/2026 ×2 | "**** TOTAL" (금액 다음 줄) + TOTAL TAX 등 |

**결론:** OCR 자체는 3/3. 다만 정규식만으로는 "총액"이 안 갈린다 — Whole Foods는
"Total Savings"가 먼저 걸리고, Costco는 TOTAL 줄과 금액이 다른 줄이며 "TOTAL TAX"·
"TOTAL NUMBER OF ITEMS"가 섞인다. **기획대로 OCR 텍스트 → Claude 구조화 출력**(S06
코드)으로 3열을 뽑는 게 맞다. 정규식 폴백은 안 만든다.

**셋업 시간:** 약 15분 (키 대기 제외 — v0 화면 작성·배포 → 3장 판정). Vision 배관은
빈 이미지로 먼저 확인했다(200, 0자 — 키·API·결제가 안 됐으면 403).

**막힌 지점 1개:** 첨부된 사진을 내가 직접 파일로 못 꺼낸다 — 판정용 업로드 경로가 필요해
스파이크 화면을 먼저 만들었다. 결과적으로 그 화면이 제품의 입력부가 됐다(판정 ①의 경로 그대로).

**문서 품질:** 상 — REST 한 번, 응답의 `fullTextAnnotation.text`면 끝.
**무료 한도:** 월 1,000건 무료(결제 연결 필수), 이후 1,000건당 $1.50. 팀 영수증 규모엔 사실상 0.

**정리 필요:** `api/spike-vision.js`는 구현이 대체하면 제거한다. 스파이크 PNG(`spike-*.png`)는 버킷에서 지운다.
