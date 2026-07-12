---
name: Monorepo lib dist rebuild requirement
description: Why editing a lib/* package's schema or exported types can cause phantom "no exported member" errors in consumers, and how to fix it.
---

In this pnpm monorepo, `lib/*` packages (e.g. `@workspace/db`) are `composite: true` TypeScript
projects with `emitDeclarationOnly` and a checked-in `dist/*.d.ts`. Consumers (artifacts) declare
these libs under `references` in their tsconfig.

When you add or rename an exported type/value in a `lib/*` package's source and then typecheck only
the consumer (e.g. `pnpm --filter @workspace/api-server run typecheck`), TypeScript's project-reference
redirect can resolve the import against the **stale `dist/*.d.ts`** rather than the edited source,
producing a misleading `TS2305: Module has no exported member 'X'` even though the source is correct.

**Why:** plain `tsc -p` compiles honor project reference declaration redirects for referenced composite
projects; they don't rebuild those referenced projects' declaration output automatically.

**How to apply:** after changing any exported symbol in `lib/*/src`, run `pnpm run typecheck:libs`
(`tsc --build`) from the repo root first — this rebuilds all lib declaration outputs — before
typechecking or debugging a consumer package that imports from it. Don't manually delete/rebuild one
package's dist by hand; use the root build-mode command so the whole dependency graph stays consistent.
