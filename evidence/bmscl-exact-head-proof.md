# BeamScale compiler exact-head proof carrier

This test-only branch temporarily borrows the healthy `zed-pkg-test` GitHub Actions runner lane to prove exact public BeamScale compiler commits while the BeamScale and generic ORES test organizations are returning zero-step/no-runner jobs.

It does not add a production dependency from Zed to BeamScale, publish artifacts, use secrets, or deploy anything.

Expected-green heads:

- `beamscale/bmscl-compiler#47` — `9d5ad4fdb84577a94696da5f99ec464f401b400a`
- `beamscale/bmscl-compiler#48` — `81b5a624864c20d3cd768ca43b03135e47b931b5`
- `beamscale/bmscl-compiler#52` — `8d73190c20bef693a2a775c7b1670f1c71220ded`

Expected-red regressions:

- `beamscale/bmscl-compiler#53` — `2b055da896be962da0cf80d9138a27ceb26023cb` — cache-path symlink isolation
- `beamscale/bmscl-compiler#55` — `91c1166ca3b4f674908c79fd4ef6422ff262f418` — dependency source traversal depth bound

Green heads must pass exact checkout verification, formatting, Clippy with warnings denied, the full Rust test suite, and a clean-tree check. Red heads pass this carrier only when their specifically named regression test fails, proving the blocker is reproducible rather than conflating it with runner failure.
