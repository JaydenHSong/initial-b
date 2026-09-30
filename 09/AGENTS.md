# Prototype Instructions

## Selected design

- Deployment: personal Vercel team `jaydenhsongs-projects`, project `initial-b09`, repository root directory `09`. The previous `palette-studio` folder was renamed to `09` at the user's request. Keep the parent repository's existing `initial-b02` CLI link intact; deploy only this application's source.
- Team gallery: `https://initialb.vercel.app`; `09/public/docs/plan.html` and `report.html` follow the shared template. The site is registered there under S09. The gallery's S09 roadmap label still names the original price-alert topic; do not edit the shared guide without an explicit scope decision.

- The user selected the second displayed mock on 2026-09-29: a large source photo on the left, five copyable HEX rows on the right, saved image/palette thumbnails below.
- Source: `/Users/jaydensong/.codex/generated_images/01a0ea05-ce1a-7173-b2ae-8309e5bbc934/exec-f7112296-a904-4a8f-acdc-458c818b5f67.png`.
- Korean UI, provisional name 모음, white surface, blue upload action. Preserve the selected composition. Three starting palettes are explicitly labeled examples.
- Core flow: upload → extract five colors → add to board → click HEX to copy. Uploaded palettes persist in this browser. No login, sharing, or palette editing.
- User requested URL import when no local image is available: allow direct image URLs through a paste form and drag/drop. Keep the selected layout. General webpage scraping is outside this feature; display actionable messages for page URLs and blocked image access.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
