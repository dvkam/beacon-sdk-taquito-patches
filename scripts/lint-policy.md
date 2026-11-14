# Lint policy

After `npm ci --include=optional`, run `npm run prebuild` and
`npm run build:packages` before type-aware lint.

`npm run lint:new` runs ESLint across every `.ts` and `.tsx` source file under
`packages/*/src`. Every per-file, per-rule count must stay at or below
`scripts/lint-baseline.json`. Missing entries allow zero findings. Reductions
pass without changing the baseline, so independent cleanup branches can merge.
The baseline is empty after the source cleanup. Every source file is expected
to have zero findings. The baseline does not disable rules or exempt touched
lines. Unused suppression comments are errors; retain a suppression only while
it addresses a real finding and document any compatibility requirement.

The command also rejects findings on added or modified lines against the merge
base with `LINT_BASE_REF`, which defaults to `origin/taquito-patches`. This catches
a replacement finding even when its file/rule count stays the same. New files
own every line. CI uses the pull request base SHA or the previous push SHA.
Full-source counts run even when the comparison base equals HEAD, and when only
configuration or dependencies changed.

ESLint launch failures, signals, operational exits, fatal diagnostics, and
missing or invalid reports exit with code 2. Ordinary findings exit with code 1
only when the count or touched-line policy rejects them. Existing debt passes.

To record cleanup, run `npm run lint:baseline` after building. Review the JSON
diff before committing. Do not raise allowances to make a regression pass.
Counts cannot identify a replacement finding elsewhere in the same file/rule
bucket when no source line changed. Review configuration and baseline changes
with that limitation in mind.

Run the CLI contract tests with
`node --test scripts/__tests__/lint-new-findings.test.js`.

The source gate does not select package tests, test setup/helpers, end-to-end
tests, scripts or build-tool configuration. Those files need an explicit lint
policy that preserves intentional negative type fixtures and declared test
utilities. Running Vitest, Node tests or Playwright does not establish lint or
static typecheck coverage. Test and tooling typechecking is tracked separately
in [issue #209](https://github.com/ecadlabs/beacon-sdk-taquito-patches/issues/209).
