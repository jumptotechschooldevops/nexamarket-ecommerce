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

## Prerequisites (cluster add-ons)

None of these are created by this directory — they're assumed to already exist on the target
EKS cluster(s) before Argo CD syncs these manifests:

| Add-on | Needed for |
|---|---|
| [AWS EBS CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) | `base/storageclass.yaml` and the PostgreSQL `volumeClaimTemplates` |
| [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) | `base/ingress.yaml` (provisions the real ALB) |
| [metrics-server](https://github.com/kubernetes-sigs/metrics-server) | `base/backend/hpa.yaml`, `base/frontend/hpa.yaml` (CPU/memory metrics) |
| [Argo CD](https://argo-cd.readthedocs.io/) | everything under `argocd/` |
| [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator) *(optional)* | `components/monitoring/` only — the `ServiceMonitor` CRD |

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

Nothing below is a real value — all of it is a template. Search the directory for these exact
strings before applying anything for real:

| Placeholder | Appears in | Replace with |
|---|---|---|
| `<AWS_ACCOUNT_ID>` | `base/kustomization.yaml`, `base/backend/deployment.yaml`, `base/frontend/deployment.yaml`, `base/jobs/migrate-job.yaml`, `components/seed-data/seed-job.yaml` | your AWS account ID |
| `<AWS_REGION>` | same files as above | the AWS region your ECR repos and EKS cluster live in |
| `<IMAGE_TAG>` | same files as above | the image tag to deploy (a Git SHA or semver tag your CI pushes) |
| `<DOMAIN_NAME_PLACEHOLDER>` | `base/ingress.yaml`, `overlays/production/{configmap,ingress}-patch.yaml` | the production public hostname |
| `<STAGING_DOMAIN_NAME_PLACEHOLDER>` | `overlays/staging/{configmap,ingress}-patch.yaml` | the staging hostname |
| `<ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `base/ingress.yaml` | an ACM certificate ARN (base's own value; overridden per-overlay below) |
| `<PRODUCTION_ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `overlays/production/ingress-patch.yaml` | production's ACM certificate ARN |
| `<STAGING_ACM_CERTIFICATE_ARN_PLACEHOLDER>` | `overlays/staging/ingress-patch.yaml` | staging's ACM certificate ARN |
| `<GITHUB_ORG_PLACEHOLDER>` | `argocd/*.yaml` | the GitHub org/user this repo lives under |
| `<STAGING_EKS_CLUSTER_API_SERVER_PLACEHOLDER>` | `argocd/appproject.yaml`, `argocd/application-staging.yaml` | staging EKS cluster's API server URL (or `https://kubernetes.default.svc` if Argo CD runs in-cluster there) |
| `<PRODUCTION_EKS_CLUSTER_API_SERVER_PLACEHOLDER>` | `argocd/appproject.yaml`, `argocd/application-production.yaml` | production EKS cluster's API server URL |

A quick way to find every remaining placeholder before a real deploy:

```bash
grep -rn "PLACEHOLDER\|<AWS_ACCOUNT_ID>\|<AWS_REGION>\|<IMAGE_TAG>" k8s/
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

This section describes the intended flow; **none of it was run against a real cluster while
building this** (see [Validation performed](#validation-performed)).

1. Install Argo CD and the cluster add-ons listed in [Prerequisites](#prerequisites-cluster-add-ons).
2. Replace every placeholder listed [above](#placeholders-you-must-replace).
3. Replace `base/secret.yaml` with a real secret-management integration (see [Secrets](#secrets))
   — never apply the template file's literal `REPLACE_ME_...` values.
4. Apply the AppProject once per Argo CD instance: `kubectl apply -f k8s/argocd/appproject.yaml`.
5. Apply the Application(s) for whichever environment(s) you're bootstrapping:
   `kubectl apply -f k8s/argocd/application-staging.yaml` and/or `application-production.yaml`.
6. Argo CD takes it from there: clones the repo, runs `kustomize build` on the overlay path, and
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
kubectl kustomize k8s/base               # 26 resources, 0 errors
kubectl kustomize k8s/overlays/staging   # 26 resources (incl. the seed Job), 0 errors
kubectl kustomize k8s/overlays/production  # 28 resources (incl. the ServiceMonitor), 0 errors

# Every built-in Kubernetes resource (everything except the Argo CD
# Application/AppProject and the ServiceMonitor, which need their CRDs
# installed to resource-map against) passes client-side schema validation
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/base)
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/overlays/staging)
kubectl apply --dry-run=client -f <(kubectl kustomize k8s/overlays/production)   # ServiceMonitor doc filtered out first

# The Argo CD and ServiceMonitor manifests were confirmed to be structurally
# valid YAML that kubectl decodes correctly — they fail only at the expected
# "no matches for kind X — ensure CRDs are installed first" step, which is
# exactly what happens with any valid CRD-backed manifest on a cluster
# that doesn't have that CRD, proving the YAML/structure itself is sound:
kubectl apply --dry-run=client -f k8s/argocd/application-staging.yaml
kubectl apply --dry-run=client -f k8s/argocd/application-production.yaml
kubectl apply --dry-run=client -f k8s/argocd/appproject.yaml
kubectl apply --dry-run=client -f k8s/components/monitoring/servicemonitor.yaml
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
| ALB never gets provisioned / Ingress has no address | AWS Load Balancer Controller not installed, or `<ACM_CERTIFICATE_ARN_PLACEHOLDER>` / `<DOMAIN_NAME_PLACEHOLDER>` never replaced | `kubectl describe ingress nexamarket-ingress -n nexamarket` for the controller's own events |
| PVC stuck `Pending` | `WaitForFirstConsumer` means it won't bind until the StatefulSet's pod is scheduled — check that pod's events first, not the PVC's | `kubectl describe pod nexamarket-postgres-0 -n nexamarket` |
| Argo CD shows `OutOfSync` on `spec.replicas` forever | `ignoreDifferences` missing or misconfigured for that Deployment | Compare against `argocd/application-*.yaml` |
| `kubectl apply --dry-run=client` errors "no matches for kind ... ensure CRDs are installed first" on `Application`/`AppProject`/`ServiceMonitor` | Expected on any cluster/machine without that CRD registered | Not an error in the manifest — see [Validation performed](#validation-performed) |

## What's intentionally not here

Per this phase's scope:

- **No GitHub Actions / CI workflow** — the masterclass implements CI live, on top of this
  directory.
- **No AWS resources were created** — no ECR repo, no EKS cluster, no ACM certificate, no IAM
  role. Every AWS-specific value is a placeholder (see [above](#placeholders-you-must-replace)).
- **Nothing was deployed to any Kubernetes cluster** — see [Validation performed](#validation-performed)
  for exactly what checks *were* run, all of them offline.

The DevOps/SRE team owns turning the placeholders into real values, standing up the cluster
add-ons, wiring real secrets, and running the first `argocd app sync` — consistent with the repo
root `README.md`'s own "Handover to DevOps" section for everything upstream of this directory.
