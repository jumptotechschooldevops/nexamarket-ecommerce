# Passing a legitimate SonarQube Quality Gate

This is a review of NexaMarket's current test coverage and a concrete plan for passing
SonarQube's Quality Gate **by writing more tests and fixing real issues**, not by lowering
thresholds, excluding files, or suppressing rules. No GitHub Actions workflow is created here —
per the current phase's scope, CI (including the `sonar-scanner` step) is implemented live in the
masterclass. This document is what that pipeline step should be checked against once it exists.

## Current coverage, measured just now

```
cd backend  && npm run test:coverage   # vitest run tests/unit --coverage
cd frontend && npm run test:coverage
```

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `backend` | 29.69% | 33.78% | 30.83% | 30.64% |
| `frontend` | 6.86% | 8.53% | 9.34% | 6.42% |

Both numbers are real and both LCOV reports (`backend/coverage/lcov.info`,
`frontend/coverage/lcov.info`) are already in the exact format SonarQube's
`sonar.javascript.lcov.reportPaths` / `sonar.typescript.lcov.reportPaths` properties expect —
nothing about the test output needs to change for Sonar to read it. The shape of the gap is what
matters, and it's explained below.

## The single most important fact: Sonar's default gate grades *new code*, not the whole repo

SonarQube's default Quality Gate ("Sonar way") applies its coverage/duplication/rating
conditions to **New Code** — the diff introduced since a defined baseline (typically "since last
version" or a rolling N-day window) — not to the repository's overall, historical coverage. This
is the fact that gets missed most often, and it's also the reason "the gate failed, let's just
lower the threshold" is almost never the right response: the gate isn't actually asking "is this
whole 15k-line app >80% covered," it's asking "is the code someone just wrote adequately tested
and clean." A legacy area with 0% coverage does not fail the gate on its own; shipping *new,
untested* code into or alongside it does.

**Action**: configure `sonar.newCode.definition` (New Code Period) explicitly rather than leaving
Sonar's installation default implicit — in a GitOps/trunk-based flow like this repo's, "reference
branch: main" (comparing every PR/feature branch against `main`) is usually the right choice. That
alone makes today's 29.69%/6.86% overall numbers a non-issue *for new code going forward*, as
long as new code itself ships with tests — which the plan below makes concrete.

## What's actually driving the low overall numbers (and why it's not alarming)

The gap is structural, not a sign of untested business logic:

- **Backend 29.69%**: the previous handover rounds already added real unit tests for the
  highest-risk logic — `orderService.checkout` (tax/shipping calculation, empty-cart/
  inactive-product/insufficient-stock rejection with rollback verification), `inventoryService`
  (95.65% covered), and `authService` (82.35% covered: duplicate-email conflict, bcrypt hashing,
  login failure modes). What's at 0% is almost entirely the **Express route layer**
  (`src/routes/*.ts`) and **middleware** (`auth.ts`, `metrics.ts`, `requestId.ts`,
  `validate.ts`) — both are exercised functionally by the 23 passing integration tests
  (`npm run test:integration`, supertest against a real PostgreSQL), which `test:coverage` simply
  doesn't instrument because it's a separate Vitest project/config
  (`vitest.integration.config.ts`). The logic isn't untested; the tool measuring "unit coverage"
  isn't looking at the suite that tests it.
- **Frontend 6.86%**: `useAsync` (the shared data-fetching hook every page now uses) sits at
  100%, and `ProductCard`/`Pagination`/format utilities are tested. Every page component
  (`CheckoutPage`, `SellerDashboardPage`, `AdminDashboardPage`, etc.) has zero component tests —
  that flow was instead validated with a real, scripted browser session (documented in the
  project's handover artifacts) rather than React Testing Library, which is a legitimate way to
  gain confidence but, like the backend's integration suite, contributes nothing to this number.

None of this is a reason to adjust the gate's definition of "covered" — it's a reason to either
add the missing unit tests (below) or merge the integration suite's coverage in (also below), and
either way, **not** to report a false "80%" by excluding the uncovered files from analysis.

## Concrete plan

### 1. Merge backend unit + integration coverage into one report (quick, high-value)

Right now `backend/coverage/lcov.info` only reflects `tests/unit`. Vitest can run both configs
with coverage and merge the results:

```bash
cd backend
npx vitest run tests/unit --coverage
DATABASE_URL=... JWT_SECRET=... npx vitest run --config vitest.integration.config.ts --coverage
npx vitest run --coverage --coverage.reportsDirectory=coverage/merged --merge-reports coverage/unit coverage/integration  # or use nyc/c8 merge if Vitest's own merge flags don't fit the installed version
```

The route handlers, `authenticate`/`requireRole` middleware, `requestIdMiddleware`, and
`validateBody`/`validateQuery`/`validateParams` are all exercised end-to-end by the integration
suite's 23 passing tests — merging that into the coverage number reported to Sonar will move the
backend's real, demonstrated coverage meaningfully closer to accurate (almost certainly past
60-70% given how much of the untested 0% is exactly this layer) without writing a single new
test. Do this before writing new tests, not instead of it.

### 2. Close the real remaining gaps with targeted unit tests

Ordered by risk × current coverage, i.e. what's worth testing first:

| File | Why it matters | What to test |
|---|---|---|
| `backend/src/middleware/auth.ts` | Authorization bugs here are a security issue, not just a bug | `requireRole` denying/allowing each role combination; `authenticate` rejecting missing/malformed/expired/tampered tokens (some of this is already implicitly covered by RBAC integration tests — add the unit-level edge cases: no `Bearer ` prefix, empty token) |
| `backend/src/services/sellerService.ts`, `dashboardService.ts` | 0% covered, contain real aggregation logic (revenue sums, low-stock threshold comparison) | Mock `pool.query` and assert the SQL params and returned shape, same pattern already used in `orderService.test.ts`/`inventoryService.test.ts` |
| `backend/src/services/productService.ts` (33.8%) | Partially tested; the update/delete paths and ownership checks aren't | `assertProductOwnership`, `updateProduct`'s dynamic `SET` clause construction, `deleteProduct`'s soft-archive behavior |
| `backend/src/validation/schemas.ts` (0%, though trivially low-risk) | Zod schemas are declarative; low bug risk, but Sonar still counts the lines | A handful of `schema.safeParse()` assertions per schema is cheap and removes a chunk of the 0% surface for little effort |
| `frontend/src/pages/CheckoutPage.tsx`, `SellerDashboardPage.tsx` | The two most complex page components; zero component tests today | React Testing Library: render with a mocked `CartContext`/API client, assert the tax/shipping math renders correctly, assert the stock-update form calls the right endpoint — the same assertions already made manually in the browser validation session, turned into repeatable tests |
| `backend/src/middleware/metrics.ts`, `requestId.ts` | Small, but currently 0% and easy | Assert `X-Request-Id` is generated when absent and echoed when provided; assert the Prometheus histogram/counter labels are populated with the right method/route/status |

### 3. Don't let "Maintainability Rating" or "Security Rating" become the next thing to work around

Sonar's other default gate conditions — Maintainability Rating A on new code (tech-debt ratio
≤5%), Reliability Rating A, Security Rating A, and 0 new Security Hotspots left "To Review" — are
graded on issues Sonar's own static analysis finds, not on anything in this repo's test suites.
The fix for any of these failing is the same principle as coverage: fix the flagged code, don't
suppress the rule. Two things in this codebase worth pre-empting:

- **CORS default (`backend/src/app.ts`, `CORS_ORIGIN` defaulting to `"*"` in
  `backend/src/config/env.ts`)** will very likely surface as a Security Hotspot
  ("Make sure this permissive CORS policy is safe"). The *fix* is not a
  `// NOSONAR`/`sonar.issue.ignore` suppression — it's that `k8s/overlays/{staging,production}/configmap-patch.yaml`
  already override it to the real domain for every real deployment; the wildcard only applies to
  local dev. Resolve the hotspot in Sonar's UI as "Reviewed → Safe" with exactly that
  justification, which is what "reviewing" a hotspot is supposed to mean — a human confirming the
  flagged pattern is intentional and safe in context, not hiding it from the scanner.
- **JWT secret handling** is already solid (enforced minimum length in `env.ts`, never logged —
  see the `pino` redact paths in `backend/src/utils/logger.ts` and `pino-http` redact config in
  `app.ts`) and should pass Sonar's secret-detection rules cleanly as long as `backend/.env`,
  `frontend/.env`, and the root `.env` stay out of Git (they already are, via `.gitignore`) and
  `k8s/base/secret.yaml` stays what it is today — a template full of `REPLACE_ME_...` literals,
  not real values (see `k8s/README.md`'s Secrets section). **Never** commit a `.env` file or a
  filled-in copy of `k8s/base/secret.yaml` to make a scan "pass" — that would make the scan
  *correctly* fail for the right reason.

### 4. What NOT to do

- Don't add `sonar.exclusions`/`sonar.coverage.exclusions` for whole directories (e.g. `routes/`,
  `pages/`) just to inflate the percentage — that hides real gaps instead of closing them, and a
  reviewer who notices the exclusion will (rightly) distrust every other number in the report.
- Don't disable or downgrade specific Sonar rules repo-wide to clear "code smell" findings;
  fix the specific line, the same way the previous handover rounds fixed ESLint's
  `set-state-in-effect` warnings at the root cause instead of downgrading that rule.
- Don't lower the Quality Gate's coverage threshold on New Code to make an unrelated legacy gap
  "pass" — the New Code Period (§ above) already solves the legacy-gap problem without touching
  the threshold at all.

## Suggested `sonar-project.properties` (to add when CI is implemented)

```properties
sonar.projectKey=nexamarket-ecommerce
sonar.sources=backend/src,frontend/src
sonar.tests=backend/tests,frontend/src
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
sonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info
sonar.typescript.lcov.reportPaths=backend/coverage/lcov.info,frontend/coverage/lcov.info
sonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**,**/*.test.ts,**/*.test.tsx
sonar.newCode.referenceBranch=main
```
