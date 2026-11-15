# NexaMarket on Amazon EKS — Kubernetes & Argo CD

This directory deploys the NexaMarket marketplace (see the repo root `README.md` for the
application itself) onto Amazon EKS, managed by Argo CD using Kustomize. It was built by
inspecting the actual application code — `backend/Dockerfile`, `frontend/Dockerfile`,
`backend/src/config/env.ts`, `backend/src/routes/health.ts`, `backend/src/app.ts`, and
`docker-compose.yml` — so every port, health path, environment variable name, and migration
command below matches what the containers actually expect, not a generic template.

**Scope note:** this directory contains Kubernetes manifests only. No GitHub Actions workflow,
no AWS resource, and nothing in an actual Kubernetes cluster was created while building this —
see [Validation performed](#validation-performed) for exactly what *was* run, and [What's
intentionally not here](#whats-intentionally-not-here) for what's left for the live masterclass.

## Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites-cluster-add-ons)
- [Directory reference](#directory-reference) — every file and what it's for
- [Placeholders you must replace](#placeholders-you-must-replace)
- [Secrets](#secrets)
- [Replica & autoscaling strategy](#replica--autoscaling-strategy)
- [PostgreSQL: single-replica limitations](#postgresql-single-replica-limitations)
- [NetworkPolicy model](#networkpolicy-model)
- [Deploying via Argo CD](#deploying-via-argo-cd)
- [Validation performed](#validation-performed)
- [Troubleshooting](#troubleshooting)
- [What's intentionally not here](#whats-intentionally-not-here)

---

## Architecture

```
                              Internet
                                 │
                      AWS Application Load Balancer
                      (provisioned by the AWS Load
                       Balancer Controller from
                       base/ingress.yaml)
                                 │
                                 ▼
                    Service: nexamarket-frontend (ClusterIP :8080)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                                ▼
      Pod: nexamarket-frontend          Pod: nexamarket-frontend  (×3 in production)
      (Nginx, unprivileged,                     ...
       proxies /api/* in-cluster)
                 │
                 │  BACKEND_UPSTREAM env var → in-cluster DNS
                 ▼
    Service: nexamarket-backend (ClusterIP :4000)
                 │
        ┌────────┴────────┐
        ▼                 ▼
  Pod: nexamarket-backend   ...  (×3 in production)
  (Express/Node, /health /ready /metrics)
                 │
                 │  DATABASE_URL (Secret)
                 ▼
    Service: nexamarket-postgres (ClusterIP :5432)
                 │
                 ▼
  StatefulSet: nexamarket-postgres (×1 — see limitations)
                 │
                 ▼
    PVC → EBS gp3 volume (encrypted, via StorageClass)
```

Two Jobs run outside this request path, triggered by Argo CD sync hooks rather than traffic:
`nexamarket-db-migrate` (always, `PreSync`) and `nexamarket-db-seed` (staging only, `PostSync`).

**Infrastructure this actually targets**: a single Amazon EKS cluster named `testingfile`
(account `668484272259`, region `us-east-2`), with two managed-node-group workers
(`t3.medium`, amd64) and Argo CD already installed in it. Staging and production both deploy to
*this same cluster* — see [Replica & autoscaling strategy](#replica--autoscaling-strategy) and
the overlays' `kustomization.yaml` files for how they're kept apart by **namespace**
(`nexamarket-staging` / `nexamarket-production`) rather than by separate clusters. Every pod
spec in `base/` carries `nodeSelector: {kubernetes.io/arch: amd64}` to match these specific
workers — see [Validation performed](#validation-performed) for how that (and everything else)
was checked.

## Prerequisites (cluster add-ons)

None of these are created by this directory. On the `testingfile` cluster, as of this write-up:

| Add-on | Needed for | Status on `testingfile` |
|---|---|---|
| VPC CNI, CoreDNS, kube-proxy | basic pod networking/DNS for everything | ✅ confirmed working |
| [metrics-server](https://github.com/kubernetes-sigs/metrics-server) | `base/backend/hpa.yaml`, `base/frontend/hpa.yaml` (CPU/memory metrics) | ✅ confirmed working |
| [Argo CD](https://argo-cd.readthedocs.io/) | everything under `argocd/` | ✅ installed, all 7 pods Ready |
| [AWS EBS CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) (`ebs.csi.aws.com`) | `base/storageclass.yaml` and the PostgreSQL `volumeClaimTemplates` | ⬜ to be installed live — see `MASTERCLASS.md` |
| [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) | `base/ingress.yaml` (provisions the real ALB) | ⬜ to be installed live — see `MASTERCLASS.md` |
| [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator) *(optional)* | `components/monitoring/` only — the `ServiceMonitor` CRD | ⬜ not required unless the monitoring component is used |

## Directory reference

```
k8s/
├── README.md                        this file
├── base/                             environment-agnostic manifests
│   ├── kustomization.yaml            assembles every base resource + the ECR image placeholders
│   ├── namespace.yaml                Namespace "nexamarket", labeled for Pod Security "restricted"
│   ├── configmap.yaml                non-secret env vars shared by backend + frontend
│   ├── secret.yaml                   SECRET TEMPLATES ONLY — see Secrets below
│   ├── storageclass.yaml             encrypted gp3 EBS StorageClass (cluster-scoped)
│   ├── serviceaccounts.yaml          one ServiceAccount per component, no K8s API access
│   ├── networkpolicy.yaml            default-deny + explicit allows between components
│   ├── ingress.yaml                  AWS ALB Ingress → frontend Service
│   ├── postgres/
│   │   ├── statefulset.yaml          1-replica PostgreSQL 16 StatefulSet + PVC template
│   │   └── service.yaml              headless Service (StatefulSet DNS) + ClusterIP Service
│   ├── backend/
│   │   ├── deployment.yaml           Express API Deployment
│   │   ├── service.yaml              ClusterIP :4000
│   │   ├── hpa.yaml                  CPU/memory autoscaling
│   │   └── pdb.yaml                  PodDisruptionBudget (50%)
│   ├── frontend/
│   │   ├── deployment.yaml           Nginx SPA Deployment
│   │   ├── service.yaml              ClusterIP :8080
│   │   ├── hpa.yaml                  CPU/memory autoscaling
│   │   └── pdb.yaml                  PodDisruptionBudget (50%)
│   └── jobs/
│       └── migrate-job.yaml          runs `node dist/db/migrate.js` as an Argo CD PreSync hook
├── components/                       OPT-IN Kustomize Components (not applied by default)
│   ├── monitoring/                   ServiceMonitor + NetworkPolicy allow for Prometheus scraping
│   │   ├── kustomization.yaml
│   │   └── servicemonitor.yaml
│   └── seed-data/                    optional demo-data seed Job
│       ├── kustomization.yaml
│       └── seed-job.yaml             runs `node dist/db/seed/run-seed.js` as a PostSync hook
├── overlays/
│   ├── staging/                      1 replica by default (configurable), demo seed data included
│   │   ├── kustomization.yaml        ← the replica-count knob lives here
│   │   ├── configmap-patch.yaml      CORS_ORIGIN, LOG_LEVEL=debug
│   │   ├── ingress-patch.yaml        internal ALB scheme, staging host/cert placeholders
│   │   ├── backend-hpa-patch.yaml    min/max replicas for the backend HPA
│   │   └── frontend-hpa-patch.yaml   min/max replicas for the frontend HPA
│   └── production/                   3 frontend + 3 backend replicas, monitoring enabled
│       ├── kustomization.yaml
│       ├── configmap-patch.yaml      CORS_ORIGIN, LOG_LEVEL=info
│       ├── ingress-patch.yaml        internet-facing ALB, production host/cert placeholders
│       ├── backend-hpa-patch.yaml
│       └── frontend-hpa-patch.yaml
└── argocd/
    ├── appproject.yaml                AppProject scoping both Applications' repo/destinations/kinds
    ├── application-staging.yaml       Argo CD Application → overlays/staging
    └── application-production.yaml    Argo CD Application → overlays/production
```

### Why two Kustomize Components instead of just more overlay resources

`components/monitoring` and `components/seed-data` hold resources that are genuinely optional —
not every cluster has Prometheus Operator installed, and demo data has no business in
production. Kustomize *components* (not the same thing as a base) are the supported way to
share an optional resource across overlays: an overlay opts in with a `components:` list instead
of copy-pasting the YAML or (what was tried first, and rejected — see `git log` on this branch if
curious) referencing a bare file living outside the overlay's own directory tree, which Kustomize
refuses on purpose for security reasons ("security; file ... is not in or below ...").

### Backend/frontend container contract, as verified in the actual code

| | Backend | Frontend |
|---|---|---|
| Container port | `4000` | `8080` |
| Health endpoint | `GET /health` (liveness, no DB check) | `GET /health` → Nginx returns `200 ok` |
| Readiness endpoint | `GET /ready` (checks PostgreSQL connectivity) | same as liveness |
| Metrics endpoint | `GET /metrics` (Prometheus text format) | — |
| Runs as | non-root `nexamarket` user (image `USER` directive) | non-root `nginx` user (uid 101, `nginxinc/nginx-unprivileged`) |
| Required env vars | `DATABASE_URL`, `JWT_SECRET` (both: see `backend/src/config/env.ts` — the process refuses to start without them) | `BACKEND_UPSTREAM` (templated into Nginx config via `envsubst` at container start) |
| Migration command | `node dist/db/migrate.js` (compiled from `backend/src/db/migrate.ts`; idempotent, tracks `schema_migrations`) | n/a |
| Seed command | `node dist/db/seed/run-seed.js` (compiled from `backend/src/db/seed/run-seed.ts`; idempotent upserts) | n/a |

`/health` and `/ready` are mounted at the application **root**, not under `/api` (see
`backend/src/app.ts`) — the probes in `base/backend/deployment.yaml` hit `/health` and `/ready`
directly, not `/api/health`.

## Placeholders you must replace

Now that the target infrastructure is known, several placeholders from the first draft of this
directory have been resolved to real values directly in the manifests: the AWS account ID
(`668484272259`), region (`us-east-2`), the GitHub org (`jumptotechschooldevops`), and the Argo CD
destination server (`https://kubernetes.default.svc`, since this is a single-cluster setup — see
[Architecture](#architecture)). What's left is genuinely not knowable yet — no ECR image has been
built, and no domain/certificate has been provisioned:

| Placeholder | Appears in | Replace with |
|---|---|---|
| `<IMAGE_TAG>` | `base/kustomization.yaml`, `base/backend/deployment.yaml`, `base/frontend/deployment.yaml`, `base/jobs/migrate-job.yaml`, `components/seed-data/seed-job.yaml` | the image tag to deploy — filled in automatically by `demo-setup/workflows/release.yml`'s GitOps-update step once that workflow is activated, or manually via `kustomize edit set image` in the meantime |
| `<DOMAIN_NAME_PLACEHOLDER>` | `base/ingress.yaml`, `overlays/production/{configmap,ingress}-patch.yaml` | the production public hostname |
| `<STAGING_DOMAIN_NAME_PLACEHOLDER>` | `overlays/staging/{configmap,ingress}-patch.yaml` | the staging hostname |
| `<ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `base/ingress.yaml` | an ACM certificate ARN (base's own value; overridden per-overlay below) |
| `<PRODUCTION_ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `overlays/production/ingress-patch.yaml` | production's ACM certificate ARN |
| `<STAGING_ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `overlays/staging/ingress-patch.yaml` | staging's ACM certificate ARN |

A quick way to find every remaining placeholder before a real deploy:

```bash
grep -rn "PLACEHOLDER\|<IMAGE_TAG>" k8s/
```

## Secrets

`base/secret.yaml` is a **template**, not something to apply as-is — every value in it is a
literal string like `REPLACE_ME_...`. It exists so the keys the application needs
(`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`) are visible
and versioned, without any actual credential ever being committed. In order of preference for a
real EKS/Argo CD environment, replace it with:

1. **External Secrets Operator** — an `ExternalSecret` that syncs these same key names from AWS
   Secrets Manager or SSM Parameter Store into a `Secret` Argo CD never needs to see the contents
   of.
2. **Sealed Secrets** (Bitnami) — commit a `SealedSecret` instead; it's encrypted with a key only
   the in-cluster controller holds, so the ciphertext is safe to store in Git.
3. At an absolute minimum, a CI/CD step that creates the Secret from a real secret store at
   deploy time (`kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`), never
   a hand-edited copy of this file with real values pasted in.

`DATABASE_URL` and the three `POSTGRES_*` values must stay consistent with each other (same
user/password/db) — nothing here assembles one from the other automatically; a templating tool
(Helm, External Secrets, a Vault agent sidecar) would normally do that for you.

## Replica & autoscaling strategy

Both environments run on the same two `t3.medium` workers, in separate namespaces — there's no
separate staging cluster to absorb load differently, so these numbers also double as the two
environments' resource budget on shared hardware.

- **Production**: fixed at **3 backend + 3 frontend** replicas (`overlays/production/kustomization.yaml`'s
  `replicas:` block), with the HPA's `minReplicas` patched to match (3) so the HPA only ever scales
  *up* from there, never below the floor the overlay commits to.
- **Staging**: **configurable**, defaulting to **1 + 1**. The exact two numbers to change live at
  the top of `overlays/staging/kustomization.yaml` under the `replicas:` key, with a comment
  marking them. If you raise them, also raise `minReplicas` in
  `overlays/staging/backend-hpa-patch.yaml` / `frontend-hpa-patch.yaml` to match, for the same
  reason as production.
- Both HPAs scale on **70% CPU** / **80% memory** utilization (`base/*/hpa.yaml`), with a 5-minute
  stabilization window before scaling down (so a brief traffic dip doesn't immediately shed pods)
  and no stabilization delay scaling up (so a real spike gets capacity fast).
- **Argo CD and the HPA would otherwise fight each other**: the HPA changes `spec.replicas` on the
  live Deployment at runtime; Argo CD's job is to make the live state match Git. Both
  `argocd/application-*.yaml` set `ignoreDifferences` on `/spec/replicas` for both Deployments
  specifically so Argo CD stops treating the HPA's own scaling as drift.

## PostgreSQL: single-replica limitations

`base/postgres/statefulset.yaml` runs **exactly one** PostgreSQL replica, by design for this
masterclass, not as an oversight. Read this before assuming it's production-ready:

- Plain PostgreSQL does not replicate itself out of the box. Setting `replicas: 2` on this
  StatefulSet would **not** create a working 2-node HA cluster — it would create two completely
  independent databases with no data between them, which is worse than one replica, not better.
- There is **no PodDisruptionBudget** for this StatefulSet. A PDB with a single replica can only
  ever specify "0 disruptions allowed," which doesn't protect availability (there's nothing to
  fail over to) — it only blocks node drains and `cluster-autoscaler` scale-downs from ever
  completing, indefinitely, until someone manually deletes or overrides the PDB. Omitting it is
  the more honest choice for a true singleton.
- No topology spread constraints either, for the same reason — spreading one pod across zones is
  meaningless.
- A node failure, a voluntary eviction, or a Pod restart means a **real outage** until the single
  pod reschedules and reattaches its EBS volume (seconds to low minutes, not zero).
- The EBS volume's `reclaimPolicy: Retain` (see `base/storageclass.yaml`) at least means a
  deleted PVC/StatefulSet doesn't also destroy the underlying data — but that's disaster
  mitigation, not availability.

For an actual production PostgreSQL tier, use one of:

- **Amazon RDS / Aurora PostgreSQL** — skip running Postgres in-cluster entirely (the normal
  recommendation for "I need a real database on AWS").
- **CloudNativePG** or the **Zalando postgres-operator** — a real operator running 3 replicas with
  streaming replication, automated failover, and a connection-pooling Service that correctly
  routes writes to the primary.

## NetworkPolicy model

`base/networkpolicy.yaml` default-denies all **ingress** traffic in the namespace, then allows
exactly three paths back in:

```
frontend  ← anywhere (0.0.0.0/0)        — it's the one thing meant to be public
backend   ← frontend only               — nothing else can reach the API directly
postgres  ← backend, migrate Job, seed Job only — never the frontend, never outside the cluster
```

`components/monitoring/servicemonitor.yaml` adds one more allow (backend ← the `monitoring`
namespace, for Prometheus to scrape `/metrics`) when that component is opted into.

**Egress is intentionally left unrestricted.** A default-deny-egress policy also needs explicit
allows for DNS (CoreDNS) and, on EKS, the node-local IMDS/API endpoints, to avoid breaking the
cluster in ways that are easy to get subtly wrong — more than this section of the masterclass
needs to demonstrate. Tightening egress the same way ingress is tightened here is a reasonable
next exercise.

The frontend's `0.0.0.0/0` ingress allow looks broad, but note *why*: the AWS Load Balancer
Controller with `target-type: ip` sends traffic from the ALB directly to pod IPs from within the
VPC, not through any identifiable in-cluster pod — so there's no meaningful
podSelector/namespaceSelector to restrict this to. Actual network isolation for the ALB itself is
the Security Group AWS attaches to it, a layer below what Kubernetes NetworkPolicies control.

## Deploying via Argo CD

**`MASTERCLASS.md` (repo root) is the authoritative, exact-command runbook for this** — from
confirming cluster access through to watching Argo CD sync both environments. The summary:

1. Install the two add-ons not yet on `testingfile`: the AWS EBS CSI driver and the AWS Load
   Balancer Controller (both via Helm, with IRSA roles — exact commands in `MASTERCLASS.md`).
2. Create the real ECR repositories, the GitHub OIDC trust relationship and IAM role (see
   `demo-setup/aws/`), and the GitHub Secrets/Variables (see `demo-setup/github-secrets-and-variables.md`).
3. Create the real Kubernetes Secrets in both namespaces (see
   `demo-setup/kubernetes-secrets-setup.md`) — never apply `base/secret.yaml`'s literal
   `REPLACE_ME_...` template values.
4. Replace the remaining placeholders listed [above](#placeholders-you-must-replace) (domain,
   certificate ARN).
5. Apply the AppProject once: `kubectl apply -f k8s/argocd/appproject.yaml`.
6. Apply both Applications: `kubectl apply -f k8s/argocd/application-staging.yaml -f k8s/argocd/application-production.yaml`.
7. Promote the workflow templates from `demo-setup/workflows/` into `.github/workflows/` to go
   live, open a PR (triggers CI), then merge (triggers the release workflow, which builds, scans,
   pushes to ECR, and updates the image tag in Git — which is what Argo CD actually syncs on).
8. Argo CD takes it from there: clones the repo, runs `kustomize build` on each overlay path, and
   applies the result — running `nexamarket-db-migrate` as a `PreSync` hook before anything else,
   and (staging only) `nexamarket-db-seed` as a `PostSync` hook after.

## Validation performed

Everything below was actually run, locally, with `kubectl kustomize` (pure manifest rendering —
no cluster contact at all) and `kubectl apply --dry-run=client` (schema validation against
kubectl's bundled OpenAPI definitions, also no cluster contact — there was no active
`kubectl config current-context` on the machine this was built on, so nothing could have reached
a live cluster even by accident):

```bash
# Every overlay builds without error
kubectl kustomize k8s/base                 # 26 resources, 0 errors
kubectl kustomize k8s/overlays/staging     # 27 resources (incl. the seed Job), 0 errors
kubectl kustomize k8s/overlays/production  # 28 resources (incl. the ServiceMonitor), 0 errors

# Every built-in Kubernetes resource passes client-side schema validation
# (this kubectl install happens to have cached OpenAPI/discovery info for
# the argoproj.io CRDs too, from prior unrelated use on this machine, so
# the Application/AppProject docs validated fully as well; the
# ServiceMonitor's CRD group wasn't cached, so it fails at the expected
# "no matches for kind — ensure CRDs are installed first" step instead,
# which still proves the YAML/structure itself is sound):
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/base)
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/overlays/staging)
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/overlays/production)   # ServiceMonitor doc filtered out first
kubectl apply --dry-run=client -f k8s/argocd/appproject.yaml
kubectl apply --dry-run=client -f k8s/argocd/application-staging.yaml
kubectl apply --dry-run=client -f k8s/argocd/application-production.yaml
kubectl apply --dry-run=client -f k8s/components/monitoring/servicemonitor.yaml

# Confirmed the per-overlay namespace rename actually works as intended —
# Kustomize's `namespace:` field both renames base/namespace.yaml's
# Namespace object itself and sets metadata.namespace everywhere else:
kubectl kustomize k8s/overlays/staging    | grep -A8 '^kind: Namespace'    # -> name: nexamarket-staging
kubectl kustomize k8s/overlays/production | grep -A8 '^kind: Namespace'    # -> name: nexamarket-production

# Confirmed every workload's nodeSelector actually resolves to amd64 (one
# per: backend, frontend, postgres, migrate Job, seed Job):
kubectl kustomize k8s/overlays/staging | grep -c 'kubernetes.io/arch: amd64'   # -> 5
```

All of the above passed with zero errors on every file in this directory. **Not run, and
deliberately out of scope**: `kubectl apply` for real (even `--dry-run=server`, which would
require a live cluster context), `argocd app sync`, or provisioning any AWS resource.

## Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| `kubectl kustomize` fails with "security; file ... is not in or below ..." | Something references a resource file outside its own overlay/component directory | Move the shared resource into a proper Kustomize Component (see `components/`) instead of pointing at a bare file in `base/` |
| Backend pods `CrashLoopBackOff` immediately, log says "Invalid environment configuration" | `JWT_SECRET` missing or under 16 characters, or `DATABASE_URL` missing | `base/secret.yaml` wasn't replaced with real values — see [Secrets](#secrets) |
| Backend pods `Running` but never `Ready` | `/ready` is failing — almost always PostgreSQL unreachable | Check `nexamarket-postgres` pod status and the `allow-ingress-to-postgres` NetworkPolicy's `podSelector` labels still match |
| `nexamarket-db-migrate` Job never completes, Argo CD sync hangs on PreSync | Same as above, or the image doesn't actually contain `dist/db/migrate.js` | Confirm the ECR image tag was built from a backend image whose `npm run build` succeeded (see repo root `backend/Dockerfile`) |
| ALB never gets provisioned / Ingress has no address | AWS Load Balancer Controller not installed, or `<ACM_CERTIFICATE_ARN_PLACEHOLDER>` / `<DOMAIN_NAME_PLACEHOLDER>` never replaced | `kubectl describe ingress nexamarket-ingress -n nexamarket-production` (or `-staging`) for the controller's own events |
| PVC stuck `Pending` | `WaitForFirstConsumer` means it won't bind until the StatefulSet's pod is scheduled — check that pod's events first, not the PVC's | `kubectl describe pod nexamarket-postgres-0 -n nexamarket-production` |
| Pod stuck `Pending`, event says no nodes match node affinity/selector | Scheduled against a non-amd64 node, or the `kubernetes.io/arch: amd64` nodeSelector doesn't match any node's actual label | `kubectl get nodes --show-labels \| grep kubernetes.io/arch` — both `testingfile` workers should show `amd64` |
| Argo CD shows `OutOfSync` on `spec.replicas` forever | `ignoreDifferences` missing or misconfigured for that Deployment | Compare against `argocd/application-*.yaml` |
| `kubectl apply --dry-run=client` errors "no matches for kind ... ensure CRDs are installed first" on `ServiceMonitor` | Expected on a cluster without Prometheus Operator's CRDs installed | Not an error in the manifest — see [Validation performed](#validation-performed) |

## What's intentionally not here

Per this phase's scope:

- **No GitHub Actions / CI workflow is *active*** — `demo-setup/workflows/ci.yml` and
  `release.yml` exist as templates, not yet copied into `.github/workflows/` where GitHub would
  actually run them. See `MASTERCLASS.md` for the exact moment they get promoted, live.
- **No AWS resources were created** — no ECR repo, no ACM certificate, no IAM role, no OIDC
  provider trust relationship, no Kubernetes Secret. `demo-setup/aws/` and the two
  `demo-setup/*-setup.md` files document the exact commands for all of these; none have been run.
- **Nothing was deployed to any Kubernetes cluster** — see [Validation performed](#validation-performed)
  for exactly what checks *were* run, all of them offline.

The DevOps/SRE team (or the masterclass's live walkthrough — see `MASTERCLASS.md`) owns running
those commands for real, wiring real secrets, and triggering the first Argo CD sync — consistent
with the repo root `README.md`'s own "Handover to DevOps" section for everything upstream of this
directory.
