# Agent instructions

## Scope and hierarchy

- These instructions apply to the whole `zed-pkg/zed-interfaces` repository unless a deeper lowercase `agents.md` adds narrower rules.
- Before editing, resolve the current working directory and load every readable ancestor `agents.md` from the filesystem root to the working directory. Do not search siblings. Resolve symlinks, deduplicate resolved files, and report unreadable or cyclic instruction files.
- `.claude/CLAUDE.md`, `.gemini/GEMINI.md`, and `.openai/AGENTS.md` are pointers only. Never duplicate instructions in tool-specific files.

## Repository role

This repository is the shared contract boundary for Zed manifests, lockfiles, registry models, language targets, paths, version requirements, synchronization, and VCS metadata. Changes here affect the CLI, API server, web server, sync engine, and generated clients.

It holds three language slices of that contract, each published as its own zed-package: the hand-written Rust crate in `src/rust`, and the generated Dart and TypeScript front-end types in `src/dart` and `src/ts`. See `docs/multi-language-layout.md`.

Implementations belong in `zed-pkg/zed-lib`, which depends on this package. Keep this repository to types, validation, and the serialization contract; move behavior out one module at a time rather than adding new implementation surface here.

## Working rules

- Rust is the only hand-written slice. `schemas/` is generated from it, and `src/dart` and `src/ts` are generated from `schemas/` — never hand-edit generated files, and regenerate both hops (`cargo run --locked --example generate_schemas`, then `npm run codegen`) in the same commit as the Rust change.
- Every file in `schemas/` must be classified in `schemas/index.json`. A new schema is front-end-facing only if a browser or Flutter client decodes it directly; toolchain and on-disk formats stay `"targets": []`.
- Do not add `dart format --set-exit-if-changed` to CI: the generator owns formatting so that generated output stays independent of the installed Dart SDK.
- Keep `.zpkg.toml` valid against this crate's own manifest model — `src/rust/tests/own_manifest.rs` enforces it, and a change to the target layout must keep that test passing.
- Preserve serialization compatibility and deterministic ordering unless an explicitly versioned migration says otherwise.
- Treat public Rust types, JSON schemas, TOML fields, lockfile formats, and path conventions as cross-repository APIs.
- Add round-trip and negative tests for every parser or schema change; do not weaken validation to make one consumer pass.
- Update interface consumers and monorepo pins in contract-first order when a change spans repositories.
- Keep the crate free of service-specific network, credential, database, and deployment policy.
- Never commit registry tokens, cloud credentials, generated secrets, or production environment files.
- Keep `Cargo.lock` and `flake.lock` committed; do not allow CI to update either lock implicitly.
- Pin GitHub Actions by immutable commit SHA and keep workflow permissions read-only unless a documented write is required.
- Resolve conflicts by preserving serialization compatibility, validation strength, generated-schema determinism, and consumer expectations rather than selecting an entire side.

## Reproducible validation

Use the pinned shell rather than mutable host toolchains:

```sh
nix develop -c agent-check
```

Focused stages are available while iterating:

```sh
nix develop -c agent-check format
nix develop -c agent-check lint
nix develop -c agent-check test
nix develop -c agent-check schemas
```

The default command runs Nix/workflow preflight, rustfmt, Clippy with warnings denied, unit tests, doctests, schema generation, and a clean-tree schema drift check.

## Validation

The pinned `agents policy` workflow validates this hierarchy and the three tool pointers. Run `nix develop -c agent-check` before requesting review.

## Repository-local Git worktrees

- Create or use a Git worktree only when the human operator explicitly authorizes it for the current task. Concurrency or a dirty checkout is not permission by itself.
- Put every authorized worktree at `<repository-root>/tmp/worktrees/<name>`; from the repository root, use `./tmp/worktrees/<name>`. Never place worktrees beside repositories or organization directories.
- Keep `tmp`, `temp`, `tmp/worktrees`, and `temp/worktrees` ignored in the repository-root `.gitignore`. Do not commit files from those directories.
- Relocate or remove a worktree only when the operator explicitly requests it. Before removal, preserve and publish intended changes, verify its commit is represented on the target branch, and confirm there are no tracked, untracked, ignored-sensitive, or in-use files that must survive. Remove it with `git worktree remove <path>` without `--force`; never delete a worktree directory with `rm`.

<!-- BEGIN ores-agents-pointer: managed by ORESoftware/my-ai; edit there, not here -->

## Canonical agent instructions

Before doing anything else in this repository, also read:

    .ores/agents/AGENTS.md

That path is a symlink to `~/codes/oresoftware/my-ai/AGENTS.md`, whose canonical copy is
<https://github.com/ORESoftware/my-ai/blob/main/AGENTS.md>.

It exists at a fixed path *inside* the repository because some agents cannot walk up past
the repository root, so machine-wide instructions one or more directories above are
invisible to them. This pointer plus that path make the same file reachable from a working
directory anywhere in the tree.

The symlink is deliberately **not committed**: it names an absolute path that is only valid
on a machine with `~/codes/oresoftware/my-ai` checked out, so committing it would produce a
broken link for everyone else and for CI. `.ores/` is git-ignored for that reason. If
`.ores/agents/AGENTS.md` is missing on your machine, create it with:

    mkdir -p .ores/agents
    ln -sfn "$HOME/codes/oresoftware/my-ai/AGENTS.md" .ores/agents/AGENTS.md

or run `~/codes/oresoftware/my-ai/scripts/link-repo-agents.sh` once to do it for every git
repository under `~/codes`, and `--check` to verify them.

A missing `.ores/agents/AGENTS.md` is a setup gap on the reader's machine, never a reason to
skip the canonical instructions: fetch them from the URL above instead.

<!-- END ores-agents-pointer -->
