# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` + `turbo` monorepo.
- `packages/ig-cli`: CLI entrypoints (`src/bin.ts`, `src/index.ts`) and command-level tests.
- `packages/ig-core`: shared contracts, validation, storage, output, and error utilities.
- `packages/provider-meta-byo` and `packages/provider-central`: provider adapters consumed by the CLI.
- `apps/central-api`: Fastify API scaffold for OAuth/session/publish routes.
- `docs/`: architecture, setup, and pre-production checklists.

Keep source files in `src/` and tests in `test/` with package-local scope.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run package dev scripts in parallel via Turbo.
- `pnpm typecheck`: strict TypeScript checks across the workspace (canonical pre-push gate).
- `pnpm lint`: repo lint task (currently `tsc --noEmit` per package).
- `pnpm test`: run Vitest suites across all packages/apps.
- `pnpm build`: compile all workspaces.
- `pnpm --filter @instacli/central-api dev`: run API locally.

## Coding Style & Naming Conventions
- Language: TypeScript (ESM, `moduleResolution: NodeNext`, `strict: true`).
- Follow existing style: 2-space indentation, double quotes, semicolons, trailing commas when multiline.
- Use `kebab-case` for filenames (example: `token-store.ts`), `PascalCase` for types/classes, `camelCase` for variables/functions.
- Prefer small, focused modules with named exports.

## Testing Guidelines
- Framework: Vitest.
- Test files use `*.test.ts` under each package/app `test/` directory.
- Mirror behavior in test names (example: `setup-meta-token-discovery.test.ts`).
- For CLI contract checks, favor machine-readable flags: `--json --quiet` (and `--dry-run` when applicable).
- Before opening a PR, run: `pnpm typecheck && pnpm test && pnpm build`.

## Commit & Pull Request Guidelines
- Use Conventional Commit style seen in history: `feat: ...`, `fix(scope): ...`, `chore: ...`.
- Keep commits scoped to one logical change.
- PRs should include a concise summary and the affected workspaces.
- PRs should include the validation commands you executed.
- PRs should include sample CLI output or API `curl` snippets for behavior changes.
- PRs should include linked issue/context when available.
- CI must pass (`typecheck`, `lint`, `test`, `build`) before merge.

## Security & Configuration Tips
- Never commit secrets from `.env`; keep `.env.example` in sync.
- Key env vars used here include `IG_META_CLIENT_ID`, `IG_META_CLIENT_SECRET`, `IG_META_REDIRECT_URI`, `IG_CENTRAL_API_URL`, and `IG_CENTRAL_CLIENT_ID`.
