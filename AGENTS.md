# Repository Guidelines

This is a Genshin-TS project. See `CLAUDE.md` for the full AI guidance.

## Layout
- `src/main.ts`: default entry
- `gsts.config.ts`: compile config (entries/outDir/inject)
- `dist/`: build outputs (generated, do not edit by hand)
- `docs/`: editor boundary guides

## Workflow
1. Update the NodeGraph ID in `src/main.ts`
2. Add `inject` in `gsts.config.ts` when needed
3. Run `npm run dev` for incremental compile

## Key Rules
- Prefer implementing gameplay logic in code; do not assume editor-authored resources already exist.
- Separate every feature into: code changes + editor setup required.
- When responding in Chinese, prefer terminology from `README_ZH.md` and `docs/EDITOR_BOUNDARIES_ZH.md`.
- For function/event reference, search `node_modules/genshin-ts/dist/src/definitions/`.
