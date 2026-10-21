# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (2026-09-10), directory `skills/install-anti-slop/assets/anti-slop/`. MIT licence in `LICENSE` (the upstream repository's root licence, verbatim).

Installed with the upstream skill's `scripts/install.mjs` into `tools/oxlint/anti-slop/`. Every copied file is byte-identical to that commit (checked against the commit's git tree, blob by blob).

## Contents

- `index.ts`: the generic plugin, registered in `.oxlintrc.json` as `anti-slop`.
- `rules/`, `shared/`: the generic rules and their helpers.
- `vendor/eslint-stylistic/`: the padding-line rule behind `require-readable-spacing`, with its own `LICENSE` and `UPSTREAM.md` (ESLint Stylistic, MIT).

## Deviations from upstream

- The opt-in Effect plugin (`effect/`) is left out: Markloom has no `effect` dependency.
- Upstream's rule tests are not part of the skill bundle and are not vendored.
- Configuration is Markloom's own (`.oxlintrc.json`): every generic rule is enabled, a few at `warn` with the reason written beside them.

## Dependencies

`oxlint` and `@oxlint/plugins` are devDependencies pinned to one exact version, 1.88.0. 1.89.0 was current at install time but its Windows native binding was blocked by Windows application control on the owner's machine; move both packages together when upgrading.

## Updating

Follow the upstream `install-anti-slop` skill's update procedure: stage the incoming revision outside this directory, merge rule by rule, keep Markloom's configuration, and update this record with the new commit.
