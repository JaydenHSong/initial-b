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
