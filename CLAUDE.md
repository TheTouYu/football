# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read First
- `README_ZH.md`: 中文模板指南和术语参考（中文环境优先阅读）。
- `docs/EDITOR_BOUNDARIES_ZH.md`: 中文版代码与编辑器职责边界说明。
- `README.md`: full usage flow, constraints, and global function cheat sheet (English reference).
- `docs/EDITOR_BOUNDARIES.md`: English decision rules for code-vs-editor responsibilities.

## Project Overview
This is a Genshin-TS project — TypeScript compiles to node graphs (`.gia`) injected into Genshin UGC maps (千星奇域). The compiler is in `node_modules/genshin-ts`.

**中文编程环境**：本项目配置了 `lang: 'zh'`，代码中使用中文事件名、中文函数别名。写代码时优先使用中文术语，参考 `README_ZH.md` 和 `docs/EDITOR_BOUNDARIES_ZH.md` 中的用词。与用户沟通使用简体中文。

## Commands
- `npm run dev` — incremental compile with auto-inject (watch mode via `gsts dev`)
- `npm run build` — full compile (`gsts`)
- `npm run maps` — list recent maps (to find `mapId`)
- `npm run backup` — open backup directory
- `npm run typecheck` — TypeScript type check
- `npm run lint` — ESLint with custom rules (catches compiler constraints early)

## Compilation Flow (Debugging)
1. TS → `.gs.ts` (node function call form)
2. `.gs.ts` → IR `.json` (nodes and connections)
3. IR → `.gia` (injectable output)

If something is wrong, compare `.gs.ts` and `.json` first. Outputs are in `dist/`.

## Scope Rules (Critical)
- **Top-level scope** (compile-time): OK to npm/file I/O and precompute. Do NOT call `g.server` or `gsts` runtime APIs here.
- **Node graph scope** (`g.server().on(...)` / `gstsServer*`): only a supported TS subset. No Promise/async/await/recursion. No `Object.*` / `JSON.*` unless wrapped in `raw(...)` or precomputed at top-level.

## Hard Constraints AI Must Follow

### Types
- `number` = **float**, `bigint` = **int**. Use `bigint` for modulo/bitwise/integer ops.
- Conditions (`if`/`while`/`switch`/`!`/ternary) must be `boolean`; use `bool(...)` if needed.
- Lists/dicts must be homogeneous; mixed element types fail.
- Empty arrays may not infer types — use `list('int', [])` with a typed placeholder.
- List indexing with `bigint` → wrap with `idx(...)`: `arr[idx(i)]`.
- `dict(...)` is read-only; for mutable dicts use graph variables (`f.get`/`f.set`).
- Use `let` to force a local variable node; `const` may be optimized into direct wiring.

### gstsServer Functions
- Must be top-level; params must be plain identifiers (no destructuring/default/rest).
- Only a single trailing `return <expr>` is allowed.
- Calls only inside `g.server().on(...)` or another `gstsServer*`.
- Inside `gstsServer*`, use `gsts.f` directly (no need to pass `f`).

### Timers
- `setTimeout`/`setInterval` in milliseconds.
- `setInterval` ≤ 100ms triggers a perf warning.
- Timer callbacks support by-value captures; dict captures not supported.
- Normal timers: OK in node graphs. Global timers: must be defined in editor first.

### Other
- `print(str(...))` for logging; `console.log(x)` (single arg only, auto-rewritten).
- `while(true)` is capped; use timers or explicit counters.
- `g.server().on(...)` event names use string literals; Chinese aliases work when `lang: 'zh'`.

## Editor Boundaries (Critical for Feature Planning)
对任何非平凡功能，必须明确区分：
- 哪些可以用代码实现
- 哪些仍需在编辑器中手动配置

代码负责：玩法流程、状态机、波次逻辑、经济结算、校验、刷怪、结算、信号编排。

编辑器负责：元件、组件、路径、界面布局/控件组、信号定义、全局计时器、商店、货币、能力单元、文本气泡、小地图标识、音频资源。

组件属于编辑器预配置内容，运行时代码可切换/修改组件行为，但不能在局内动态添加或删除组件。
—— 详细规则见 `docs/EDITOR_BOUNDARIES_ZH.md`。

## g.server Options
- `id`: target NodeGraph ID (must exist in map; must be empty or name starting with `_GSTS` for injection)
- `variables`: declare graph variables → enables typed `f.get`/`f.set`
- `lang: 'zh'`: Chinese event names and function aliases
- `mode`: `'beyond'` (default, fuller) or `'classic'` (narrower)
- Entries with same `id` auto-merge.

## Looking Up Functions
Search `node_modules/genshin-ts/dist/src/definitions/` with keywords (event name, function name, Chinese alias).
