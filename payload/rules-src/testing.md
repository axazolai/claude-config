---
paths:
  - "**/*.{test,spec}.{js,jsx,ts,tsx}"
  - "**/__tests__/**/*.{js,ts,jsx,tsx}"
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/tests/**/*.py"
  - "**/*Test.kt"
  - "**/*Spec.kt"
---

# Testing (cross-cutting)

## Running tests — cadence and scope
- Never run tests per edit. Run at a completion boundary (the change stands as a working whole)
  or on a direct ask to commit, push, test, or review. While debugging a known failure, re-run
  that one test freely.
- Before commit: the linter over touched files + only the tests covering the change. Select with
  the runner's own filter — `vitest related <files>`, `jest --findRelatedTests <files>`,
  `pytest <file>::<test>` or `-k <expr>`, `dotnet test --filter`, `go test ./<pkg>`,
  `gradle test --tests <pattern>`.
- Full suite: at review, immediately before `git push`, or on explicit request. No git in the
  project: at review or on request only.
- A failing targeted run blocks the commit. Fix the cause; never widen the run to dilute it.
- Report the scope with the result. "Tests pass" is reserved for a green full suite.
- After the push: prune. See "Post-push prune" below.

## Test tiers — what survives the push
- A test that must outlive the push carries `@critical` or `@important` as the first token of its
  name. Untagged is the default and means "deleted at the next prune". Tag at the moment the test
  is written, never at prune time.
- `@critical` — a failure means a crash, data loss or corruption, a security bypass, a money
  error, or a broken core workflow.
- `@important` — the test asserts the behaviour of a function, procedure, computation or
  transformation: input to output.
- Neither tier: wiring and config, registry/constant contents, structural or shape assertions,
  documentation-consistency checks, coverage filler, scratch checks written to watch one
  debugging session. Business logic and data schemas are specified in the project spec; a test
  that only restates one is not a behaviour test.
- The tag lives in the name, so every runner filters on it without a plugin:
  `vitest -t "@critical"`, `jest -t "@critical"`, `pytest -k "critical"`,
  `dotnet test --filter "DisplayName~@critical"`, `gradle test --tests '*@critical*'`.
  Annotation-style languages carry it in the declared display name.
- When the tier is arguable, the test goes.

## Post-push prune
Applies only to a project that actually has tests. No test files, no prune, no question asked —
never open the subject to propose writing tests, and never treat an empty result as a finding.
Otherwise, run after every `git push`, in this order:
1. Collect every test declaration whose name carries neither tag —
   `grep -rLn "@critical\|@important"` over the test files names the fully untagged ones, then
   read the mixed files for the rest.
2. List the candidates, state what survives, ask. Delete only the confirmed set.
3. Sweep the residue: a file with no test left is deleted, not left as an empty shell; empty
   `describe`/`suite`/class blocks go; fixtures, factories, helpers and imports orphaned by the
   deletion go with them.
4. Run the project's linter if it configures one.
5. Re-run the surviving suite — a deletion can take a shared fixture with it.
6. Commit the prune on its own.

## Test-first vs test-after
- TDD is the default for code with real behavior: services, guards/pipes, business logic,
  API contracts. Write the test first, then the code — tagged or not, it earns its keep before
  the push.
- RED confirmation batches with the boundary run: a test never observed failing is checked
  against the pre-change code before the work is called done.
- Exceptions (covered by the e2e/integration test of the behavior they enable, not a
  dedicated unit test on themselves): pure wiring/config (DI providers/module registration,
  Dockerfile, docker-compose.yml), trivial DTO mappers, pure getters/passthroughs with no
  branching.

## Choosing what to test — plan before code
- Write the scenario list first: one line per behaviour, naming the input class and the expected
  result. Trim it, then implement it. State the plan in the reply; wait for approval only when it
  runs past a dozen lines.
- Pick inputs by equivalence partitioning: split the input domain into classes the code treats
  identically, take ONE representative per class. A second example from a covered class is a
  duplicate, not a test.
- Add each class's boundaries: the values either side of every limit, empty, and the maximum the
  contract admits.
- Default budget per unit: 1-2 happy path, 2-3 boundary, 2-3 error. Go past it only when the code
  has more real branches, and name the branch each extra test pins.
- A path matched by `.gitignore` is not a test target and is excluded from coverage: build output,
  generated code, vendored trees, local config, the scratchpad. Test the source that produces it.

## Test density — "boundary trust"
- Test behavior actually reachable given real callers/guarantees, not the full domain of a
  signature. If a precondition is already enforced upstream (schema validation, an
  exhaustive type union, an earlier guard), don't re-test it downstream — test it once, at
  the boundary that enforces it.
- Cover: business-logic branches, reachable errors, security-relevant behavior, integration
  seams (real DB/cache — don't mock the unit under test).
- Skip: paths already unreachable per types/schema, trivial DTO mappers, pure
  getters/passthroughs, and the language or framework itself — getters, setters, constructors,
  plain data holders, library behaviour.
- CI gate: run the `@critical` tier fast and blocking, the rest of the surviving suite
  separately. The wiring is project-specific — put it in that project's own `CLAUDE.md`.

- Arrange-Act-Assert; one behavior per test, name it after the behavior, not the method
  (`returns 404 when user missing`, not `testGetUser2`).
- Test through the public interface; don't mock the unit under test itself, only its
  external dependencies (network, DB, clock, filesystem).
- Deterministic: no real sleep/network/wall-clock; inject/fake time, fake I/O boundaries.
- A default parameter is not injection. A fixture that hardcodes an absolute timestamp while
  the code under test defaults its own `now` to the real clock is a dated bomb: it passes
  until the encoded date falls outside whatever window the code applies, then fails forever,
  and it fails on a machine nobody changed. Pass the clock in from the test. When a suite
  already has such fixtures, the fix is the injection point, not a fresher date.
- Prefer real objects/fixtures over mocks when cheap; mock only true external boundaries.
- Cover failure paths and edge cases, not just the happy path — a bug fix needs a
  regression test that fails before the fix and passes after.
- Snapshot tests are for stable rendering/serialization output, never for business-logic
  assertions — a snapshot that always auto-updates is not a test.
- Coverage % is a smell detector, not a goal — 100% coverage of untested behavior is worse
  than 80% covering the real edge cases.
- Test data via factories/builders, not copy-pasted literals across tests.
- Avoid: testing private/internal implementation details, over-mocking that ends up
  asserting the mock instead of the behavior, flaky tests tolerated with retries instead of
  fixed, one giant test asserting many unrelated things.

## Parallel test isolation — never share one mutable DB across workers
- Jest (and vitest / pytest-xdist) parallelize at the test-FILE level — one worker per file. If
  every worker hits the SAME database, workers race: one file's truncate/seed clobbers another's
  reads → flaky, order-dependent passes. This is the same failure class as any mutable resource
  shared across a parallel wave; retries only mask it (and are banned above). Isolate DB state PER
  WORKER, keyed off the worker index (Jest `JEST_WORKER_ID` = 1..N; vitest `VITEST_POOL_ID`;
  pytest-xdist `PYTEST_XDIST_WORKER`). Create the namespace once in global/setup, drop it in
  teardown:
  - **PostgreSQL** — schema-per-worker: give each worker its own schema and
    `SET search_path TO test_w${JEST_WORKER_ID}` on its connections; migrate each schema once.
    Cheaper than a database per worker, full isolation. (DB-per-worker also works, heavier.)
  - **MySQL / MariaDB** — database-per-worker (a MySQL "schema" IS a database):
    `test_${JEST_WORKER_ID}`, migrate each once, `USE` it per connection.
  - **SQLite** — file-per-worker (`./.tmp/test_${JEST_WORKER_ID}.db`) or an in-memory DB per
    worker; isolation is free — often the best fit for unit-level DB tests.
  - **MongoDB** — database-per-worker (`test_${JEST_WORKER_ID}`) or, if lighter, a per-worker
    collection prefix; drop the DB in teardown.
- Faster alternative WITHIN a worker: wrap each test in a transaction and ROLLBACK in `afterEach`
  (no residue, fast). Caveat: breaks if the code under test opens/commits its own transactions or
  the test asserts commit behavior, and the pool must pin a single connection for the test.
- Testcontainers — an ephemeral DB container keyed by the worker index gives the strongest
  isolation at higher cost; reach for it when a shared server can't be namespaced cleanly.
- Last resort only: serialize DB-touching suites (`--runInBand` / `maxWorkers=1`, or split them
  into a separate Jest project run serially while unit tests stay parallel). Sacrifices speed —
  prefer per-worker isolation first.
- Every per-worker DB/schema/file MUST be torn down (drop schema/DB, delete file), or CI
  accumulates orphaned namespaces run after run.
