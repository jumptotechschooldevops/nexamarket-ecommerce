# Kubernetes Secrets creation commands

**Not run.** These create the real Secrets `k8s/base/secret.yaml`'s template documents the shape
of (see that file's own comments) — for the live masterclass session, against the `testingfile`
EKS cluster, in both the `nexamarket-staging` and `nexamarket-production` namespaces (created by
Argo CD from `k8s/base/namespace.yaml`, renamed per-overlay — see `k8s/README.md`'s Architecture
section). Every value below is a placeholder; generate real ones at the time these commands are
actually run, never reuse the examples shown here.

Run `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -` rather than a bare
`create`, so re-running this later (e.g. to rotate a credential) updates the existing Secret
instead of erroring that it already exists.

## 1. Generate real values (do this live, not in advance)

```bash
# A strong, random password for the in-cluster Postgres user:
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# A strong, random JWT signing secret (the app's zod schema in
# backend/src/config/env.ts requires 16+ characters; this is far longer):
JWT_SECRET=$(openssl rand -base64 48)

echo "Generated — copy these somewhere safe (e.g. your password manager) before continuing:"
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
```

## 2. Per namespace: `nexamarket-postgres-credentials`

Keys must match exactly what `k8s/base/postgres/statefulset.yaml` reads via `secretKeyRef`:
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

```bash
for ns in nexamarket-staging nexamarket-production; do
  kubectl create secret generic nexamarket-postgres-credentials \
    --namespace "$ns" \
    --from-literal=POSTGRES_USER=nexamarket \
    --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    --from-literal=POSTGRES_DB=nexamarket \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

Using the **same** generated password for both namespaces is a deliberate simplification for this
masterclass (two independent single-replica Postgres instances, one per namespace — see
`k8s/README.md`'s PostgreSQL limitations section) — in a real multi-environment setup, generate a
different password per environment so staging and production credentials are never
interchangeable.

## 3. Per namespace: `nexamarket-backend-secrets`

Keys must match exactly what `k8s/base/backend/deployment.yaml` (and the migrate/seed Jobs) read
via `envFrom: secretRef`: `DATABASE_URL`, `JWT_SECRET`. `DATABASE_URL` must use the **same**
`POSTGRES_PASSWORD` as step 2 for that namespace, and the short, unqualified Service name
(`nexamarket-postgres`, not a fully-qualified `...svc.cluster.local` name) — see
`k8s/base/secret.yaml`'s comment for why the short name is what resolves correctly regardless of
which namespace an overlay deploys into.

```bash
for ns in nexamarket-staging nexamarket-production; do
  kubectl create secret generic nexamarket-backend-secrets \
    --namespace "$ns" \
    --from-literal=DATABASE_URL="postgres://nexamarket:${POSTGRES_PASSWORD}@nexamarket-postgres:5432/nexamarket" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

Using one shared `JWT_SECRET` across both namespaces means a token issued by staging would also
verify as valid against production's backend (and vice versa) — acceptable for this masterclass's
single-cluster demo, but worth calling out explicitly: generate a **separate** `JWT_SECRET` per
environment in step 1 (run it twice, once per namespace, instead of once) if that property
matters for your use case.

## 4. Verify (without printing the actual secret values)

```bash
kubectl get secrets -n nexamarket-staging nexamarket-postgres-credentials nexamarket-backend-secrets
kubectl get secrets -n nexamarket-production nexamarket-postgres-credentials nexamarket-backend-secrets

# Confirms the right KEYS exist without decoding any value:
kubectl describe secret nexamarket-backend-secrets -n nexamarket-staging
```

## Longer-term: replace this with a real secrets manager

These `kubectl create secret` commands are the right choice for getting the masterclass demo
running today, but see `k8s/README.md`'s Secrets section for the three options (External Secrets
Operator, Sealed Secrets, or at minimum a CI-driven creation step) that remove the need to ever
type a real credential into a terminal by hand in the first place.
