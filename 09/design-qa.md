# 모음 — design QA

final result: passed

## Gallery registration — 2026-09-30

- Published the shared-template `public/docs/plan.html` and `report.html` on the `initial-b09` production alias, and confirmed both render with S09/모음 metadata.
- Registered `https://initial-b09.vercel.app` through the existing gallery form. The gallery reported `등록됐다.` and rendered the new card with screenshot, author, option, intro, plan and report links.
- Confirmed the comparison table reads an S09 row for `Color Thief + IndexedDB`. Unmeasured time and subjective grades are blank rather than fabricated.
- Updated `01/index.html` so a sprint with a submitted card does not repeat as the upcoming placeholder. Redeployed `initial-b01` and confirmed one S09 node, the new card, and zero duplicate upcoming nodes.
- Evidence: `qa/gallery-registered.png`.

## Production deployment — 2026-09-29

- Renamed app folder to `09`; built successfully and six URL tests passed after the move.
- Created personal-team project `initial-b09`; CLI inspection confirms Root Directory `09`, Vite, npm ci, npm run build, dist/client.
- Deployment `dpl_9USCnAMgjt9yXugUgCXUxzjziGma` reached READY and alias https://initial-b09.vercel.app.
- Opened public alias without a login gate. Real external image URL produced five colors and increased collection count from 3 to 4. HEX copy resolved with the correct success state. Browser warning/error logs empty.
- Evidence: `qa/production.png` (initial page), `qa/production-tested.png` (URL result and copied HEX).

## URL import addition — 2026-09-29

- Added a secondary URL action, accessible native dialog, and URI/plain-text link drop handling. Original image upload and palette layout are preserved.
- Real public Unsplash image URL loaded through the dialog, produced five HEX colors, closed the dialog, and increased test-origin collection count from 4 to 5. Reload restored the imported image and colors.
- Submitted the local HTML page URL; actionable “이미지 주소 복사” guidance appeared inline.
- Inspected desktop dialog (`qa/url-dialog.png`) and 390px mobile dialog (`qa/url-mobile.png`); input, help and submit action remain readable and within the screen.
- Six URL unit tests passed: URL validation, URI/plain-text drop parsing, successful download/options, HTML response rejection, CORS/network feedback, streamed size limit without Content-Length.
- Production build passed; browser warning/error logs empty.
- Native link dragging was not separately exercised; drop-data parsing is covered by unit tests. Cross-origin success depends on the source server allowing CORS.

## Visual truth and evidence

- Source: `qa/reference.png` (the second displayed mock selected by the user), 1487 × 1058 pixels.
- Desktop implementation: `qa/desktop-matched.png`, 1406 × 1000 pixels, captured with Codex in-app browser at CSS viewport 1421 × 1011, devicePixelRatio 1. The native capture excludes scrollbar/surface edges. Reference proportionally downsampled using ImageOps.contain to the same comparison canvas; no stretching. Compare composition rather than claiming pixel identity.
- State: first example selected, five swatches, three collection items, second HEX copied. Keyboard focus outline in implementation is intentional.
- Full paired comparison: `qa/comparison-final.jpg`. Both reference and implementation were opened together and inspected.
- Focused palette/typography/icons comparison: `qa/comparison-palette.jpg`, inspected at readable size.
- Responsive evidence: `qa/mobile-copy.png`, `qa/mobile-board.png` (390 × 844 CSS), `qa/mobile-320-final.png` (320 × 740 CSS, 305 × 705 capture after focus scroll), `qa/tablet-final.png` (834 × 1100 CSS and capture).
- User preview: `qa/preview.png` (initial state). Local preview: http://localhost:4173/.
- Native `getScreenshot` captures were used for final evidence. Earlier full-page export attempts incorrectly drew the content at half size; those were discarded as comparison inputs.

## Findings and comparison history

1. First desktop pass (`qa/comparison-first.jpg`): [P2] title/subtitle were smaller and the swatch panel tighter/higher than the selected mock. Increased display type, adjusted line height and panel top padding, and increased row height. Re-captured and compared full and focused views. Hierarchy and photo/palette/collection composition now match; no remaining actionable P0/P1/P2 mismatch.
2. Small phone pass: [P2] copied badge overlapped HEX at 320px; minimum body width plus scrollbar caused horizontal overflow. Removed rigid body minimum, used a check-only success badge on narrow displays. `qa/mobile-320-final.png` confirms full HEX remains legible; document body/client widths both 305px.
3. Tablet pass: [P2] success badge overlapped HEX and subtitle stranded a final Korean syllable. Used compact success icon in the intermediate breakpoint and keep-all natural text wrapping. Restored contain rendering so original images remain fully visible. `qa/tablet-final.png` confirms fixes; body/client widths both 834px.

## Required fidelity surfaces

- Fonts/typography: locally bundled Noto Sans KR Variable; bold Korean headline, softer supporting text, monospaced HEX. Text size and weight tuned against reference. No truncation of main tasks. Filenames truncate intentionally with full title text available.
- Spacing/layout: preserved slim header, large left photograph, right five-row palette, dividing rule, and three saved previews. Mobile stacks those regions in task order. Modest responsive differences from raster source are intentional.
- Colors/tokens: white surface, dark type, blue upload action, fine gray separators and near-black copy badge. Example HEX colors match the selected mock. Real uploads use Color Thief results.
- Images: three individually generated photos match architecture, ceramic still life and coastal subjects. Real raster assets, no placeholders or CSS illustrations. Photo scenes are recreated rather than exact crops; minor composition variation is accepted P3. Main user photo uses contain at every breakpoint.
- Copy/content: Korean product language preserved. Starting examples explicitly say 예시 rather than falsely claiming they were user uploads; saved uploaded images show 보드에 자동 저장됨. Storage-locality and accepted formats are unobtrusive added guidance.
- Icons/accessibility: Phosphor outline icons, semantic buttons, alt text, keyboard focus, live announcements, reduced motion. Copy remains keyboard-operable. Desktop success includes text; compact versions preserve accessible announcement.

## Functional verification

- Production build passed.
- Local Vite page rendered with no overlay; browser error/warning logs empty.
- Activated HEX control with keyboard: exact corresponding HEX shown in live status and copied badge, after Clipboard API resolved. Native/virtual clipboard mirrors differ in this environment, so an external paste target was not asserted.
- Uploaded `public/assets/coast.png` via native file chooser on test origin http://127.0.0.1:4173/.
- Five actual extracted values displayed: #4672A8, #BDA792, #081F18, #B9C9E0, #49504B. Collection count increased from 3 to 4; local save success displayed.
- Reload restored the uploaded palette and collection count from IndexedDB.
- Selecting ceramic example updated the large source photo, filename, five HEX rows and pressed state.
- Phone and tablet widths inspected, success states tested, overflow checked.
- File drag/drop is implemented but was not separately exercised with native drag input. Error branches and storage quota behavior are not exhaustively tested.

## Follow-up polish

- P3: source photograph details differ slightly from the generated mock; subject, palette and framing remain aligned.
- P3: the sample status and local storage footer are intentional additions, not original mock content.
- Public production deployment added on 2026-09-29 at https://initial-b09.vercel.app (personal team, project initial-b09, root directory 09). Storage remains browser-local.
