# NexaMarket DevOps Masterclass — exact commands, start to finish

This is the live runbook: every command, in order, to take this repository from "manifests and
workflow templates committed, nothing deployed" to "running on EKS via Argo CD, with CI/CD
enforcing lint, tests, SonarQube and Trivy on every change." Nothing in this file has been run
against the real `testingfile` cluster or AWS account `668484272259` while preparing it — see
each phase's own notes for what *was* validated ahead of time (locally, offline) versus what's
genuinely being done live for the first time here.

Replace `<...>` placeholders as you go; most of them only exist because the thing they name
(an IAM role ARN, an ECR repo URI with a real tag) doesn't exist yet at the start of this
session.

## Contents

0. [Known starting state](#0-known-starting-state)
1. [Confirm cluster access](#1-confirm-cluster-access)
2. [Install the two missing cluster add-ons](#2-install-the-two-missing-cluster-add-ons)
3. [Create the ECR repositories](#3-create-the-ecr-repositories)
4. [Set up GitHub OIDC + the IAM role](#4-set-up-github-oidc--the-iam-role)
5. [Configure GitHub Secrets & Variables](#5-configure-github-secrets--variables)
6. [Create the Kubernetes Secrets](#6-create-the-kubernetes-secrets)
7. [Bootstrap Argo CD](#7-bootstrap-argo-cd)
8. [Activate CI](#8-activate-ci)
9. [Activate the release workflow and watch GitOps close the loop](#9-activate-the-release-workflow-and-watch-gitops-close-the-loop)
10. [Verify the live application](#10-verify-the-live-application)
11. [Troubleshooting](#11-troubleshooting)
12. [Teardown (if this is a throwaway demo cluster)](#12-teardown-if-this-is-a-throwaway-demo-cluster)

---

## 0. Known starting state

Confirmed before this session:

- EKS cluster `testingfile`, AWS account `668484272259`, region `us-east-2`.
- Two managed-node-group workers, `t3.medium`, amd64, both `Ready`.
- VPC CNI, CoreDNS, kube-proxy, metrics-server: working.
- Argo CD installed, all 7 pods `Ready`.
- `k8s/` (Kustomize base + staging/production overlays), `demo-setup/` (inert workflow
  templates, AWS IAM JSON templates, setup docs), and `docs/sonarqube-quality-gate-recommendations.md`
  are committed on `feature/kubernetes-infrastructure` (PR #1).

Not yet done, and what the rest of this file walks through: the AWS EBS CSI driver, the AWS Load
Balancer Controller, the ECR repositories, GitHub OIDC trust + IAM role, GitHub Secrets/Variables,
the real Kubernetes Secrets, the Argo CD Applications, and activating both GitHub Actions
workflows.

## 1. Confirm cluster access

```bash
aws sts get-caller-identity
# Expect Account: 668484272259

aws eks update-kubeconfig --region us-east-2 --name testingfile

kubectl get nodes -o wide
# Expect exactly 2 nodes, STATUS=Ready, and under "ARCHITECTURE"/labels: amd64
kubectl get nodes -L kubernetes.io/arch

kubectl get pods -n argocd
# Expect 7/7 pods Running/Ready
```

## 2. Install the two missing cluster add-ons

Both need an IRSA (IAM Roles for Service Accounts) role — this assumes an OIDC provider already
exists for the `testingfile` cluster itself (a standard one-time EKS setup step, separate from
the *GitHub* OIDC provider in step 4):

```bash
# One-time, only if the cluster's own OIDC provider isn't already associated:
eksctl utils associate-iam-oidc-provider --cluster testingfile --region us-east-2 --approve
```

### 2a. AWS EBS CSI driver (`ebs.csi.aws.com`)

```bash
eksctl create iamserviceaccount \
  --cluster testingfile --region us-east-2 \
  --namespace kube-system --name ebs-csi-controller-sa \
  --role-name AmazonEKS_EBS_CSI_DriverRole \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve --override-existing-serviceaccounts

eksctl create addon \
  --cluster testingfile --region us-east-2 \
  --name aws-ebs-csi-driver \
  --service-account-role-arn "arn:aws:iam::668484272259:role/AmazonEKS_EBS_CSI_DriverRole" \
  --force

kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
```

### 2b. AWS Load Balancer Controller

```bash
curl -o lb-controller-iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.9.0/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://lb-controller-iam-policy.json

eksctl create iamserviceaccount \
  --cluster testingfile --region us-east-2 \
  --namespace kube-system --name aws-load-balancer-controller \
  --role-name AmazonEKS_LoadBalancerControllerRole \
  --attach-policy-arn "arn:aws:iam::668484272259:policy/AWSLoadBalancerControllerIAMPolicy" \
  --approve --override-existing-serviceaccounts

helm repo add eks https://aws.github.io/eks-charts
helm repo update eks

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=testingfile \
  --set region=us-east-2 \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

kubectl get deployment -n kube-system aws-load-balancer-controller
rm lb-controller-iam-policy.json
```

## 3. Create the ECR repositories

```bash
aws ecr create-repository \
  --repository-name nexamarket-backend \
  --region us-east-2 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS

aws ecr create-repository \
  --repository-name nexamarket-frontend \
  --region us-east-2 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS
```

`scanOnPush=true` gives a second, AWS-native vulnerability scan on top of the Trivy scan already
in `demo-setup/workflows/release.yml` — redundant on purpose; the two use different CVE feeds.

## 4. Set up GitHub OIDC + the IAM role

```bash
# One-time per AWS account — skip if a GitHub OIDC provider already exists:
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Fill in the real org/repo in the trust policy template first:
sed -i.bak 's#<GITHUB_ORG>/<GITHUB_REPO>#jumptotechschooldevops/nexamarket-ecommerce#' \
  demo-setup/aws/github-oidc-trust-policy.json
rm demo-setup/aws/github-oidc-trust-policy.json.bak

aws iam create-role \
  --role-name nexamarket-github-actions-release \
  --assume-role-policy-document file://demo-setup/aws/github-oidc-trust-policy.json

aws iam create-policy \
  --policy-name nexamarket-ecr-least-privilege \
  --policy-document file://demo-setup/aws/ecr-least-privilege-policy.json

aws iam attach-role-policy \
  --role-name nexamarket-github-actions-release \
  --policy-arn arn:aws:iam::668484272259:policy/nexamarket-ecr-least-privilege

aws iam get-role --role-name nexamarket-github-actions-release --query 'Role.Arn' --output text
# Copy this ARN — it's AWS_OIDC_ROLE_ARN in step 5.
```

> **Revert the edit to `demo-setup/aws/github-oidc-trust-policy.json`** (`git checkout --
> demo-setup/aws/github-oidc-trust-policy.json`) after creating the role, so the committed file
> stays a template with the `<GITHUB_ORG>/<GITHUB_REPO>` placeholder for the next person who reads
> it — don't commit your real org/repo into this file.

## 5. Configure GitHub Secrets & Variables

Full explanation of what's a Secret vs. a Variable and why:
[`demo-setup/github-secrets-and-variables.md`](demo-setup/github-secrets-and-variables.md).

```bash
gh secret set SONAR_TOKEN --repo jumptotechschooldevops/nexamarket-ecommerce

gh variable set AWS_REGION --repo jumptotechschooldevops/nexamarket-ecommerce --body "us-east-2"

gh variable set AWS_OIDC_ROLE_ARN --repo jumptotechschooldevops/nexamarket-ecommerce \
  --body "arn:aws:iam::668484272259:role/nexamarket-github-actions-release"

gh variable set SONAR_HOST_URL --repo jumptotechschooldevops/nexamarket-ecommerce \
  --body "<YOUR_SONARQUBE_SERVER_URL>"
```

## 6. Create the Kubernetes Secrets

Full commands with the reasoning behind each value:
[`demo-setup/kubernetes-secrets-setup.md`](demo-setup/kubernetes-secrets-setup.md). Short version:

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 48)

for ns in nexamarket-staging nexamarket-production; do
  kubectl create secret generic nexamarket-postgres-credentials --namespace "$ns" \
    --from-literal=POSTGRES_USER=nexamarket \
    --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    --from-literal=POSTGRES_DB=nexamarket \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl create secret generic nexamarket-backend-secrets --namespace "$ns" \
    --from-literal=DATABASE_URL="postgres://nexamarket:${POSTGRES_PASSWORD}@nexamarket-postgres:5432/nexamarket" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

(This creates the two namespaces' Secrets ahead of the namespaces themselves existing — that's
fine, `kubectl create secret ... | kubectl apply -f -` on a namespace that doesn't exist yet will
error. Run this step *after* step 7 creates the namespaces, or re-run it if it fails here.)

## 7. Bootstrap Argo CD

Replace the domain/certificate placeholders first — a real ACM certificate needs to exist, and
`<DOMAIN_NAME_PLACEHOLDER>`/`<STAGING_DOMAIN_NAME_PLACEHOLDER>` in
`k8s/base/ingress.yaml`/`k8s/overlays/*/ingress-patch.yaml` need to resolve to whatever the ALB
ends up with (either update DNS after, or use the ALB's own hostname for the demo).

```bash
kubectl apply -f k8s/argocd/appproject.yaml
kubectl apply -f k8s/argocd/application-staging.yaml
kubectl apply -f k8s/argocd/application-production.yaml

# Re-run step 6 now that Argo CD has created both namespaces:
# (the loop above, if it failed before)

argocd app list
argocd app get nexamarket-staging
argocd app get nexamarket-production
```

At this point both Applications will show `OutOfSync`/degraded — `<IMAGE_TAG>` in
`k8s/base/kustomization.yaml` is still a literal placeholder, so no image reference is pullable
yet. That's expected and resolves in step 9.

## 8. Activate CI

```bash
mkdir -p .github/workflows
cp demo-setup/workflows/ci.yml .github/workflows/ci.yml
cp demo-setup/sonar-project.properties sonar-project.properties

git checkout -b demo/activate-ci
git add .github/workflows/ci.yml sonar-project.properties
git commit -m "ci: activate CI workflow (lint, tests, SonarQube, Trivy)"
git push -u origin demo/activate-ci

gh pr create --base main --head demo/activate-ci \
  --title "Activate CI workflow" \
  --body "Live masterclass: promotes demo-setup/workflows/ci.yml to .github/workflows/."
```

Opening this PR is what actually triggers the workflow for the first time — watch it run:

```bash
gh pr checks --watch
```

Merge once it's green:

```bash
gh pr merge --squash --delete-branch
```

## 9. Activate the release workflow and watch GitOps close the loop

```bash
cp demo-setup/workflows/release.yml .github/workflows/release.yml

git checkout main && git pull
git checkout -b demo/activate-release
git add .github/workflows/release.yml
git commit -m "ci: activate release workflow (OIDC, build, scan, ECR push, GitOps update)"
git push -u origin demo/activate-release

gh pr create --base main --head demo/activate-release \
  --title "Activate release workflow" \
  --body "Live masterclass: promotes demo-setup/workflows/release.yml to .github/workflows/."
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Merging to `main` triggers `release.yml` for the first time: it builds both images for
`linux/amd64`, scans each with Trivy, pushes to ECR, then commits the real image tag into
`k8s/base/kustomization.yaml` and pushes that back to `main` (with `[skip ci]`, so it doesn't
retrigger itself).

```bash
# Watch the release workflow run:
gh run watch

# Then watch Argo CD pick up the Git change it just pushed:
argocd app sync nexamarket-staging
argocd app sync nexamarket-production
argocd app wait nexamarket-staging --health
argocd app wait nexamarket-production --health

kubectl get pods -n nexamarket-staging
kubectl get pods -n nexamarket-production
```

(With `syncPolicy.automated` already set on both Applications, Argo CD's own polling loop would
pick this up within its default interval without the manual `argocd app sync` calls above —
they're here so the masterclass doesn't have to wait on that interval live.)

## 10. Verify the live application

```bash
kubectl get ingress -n nexamarket-production
# Note the ADDRESS column — the ALB's own DNS name, usable immediately
# even before any real domain/Route53 record points at it.

curl -sk "https://<ALB_ADDRESS_FROM_ABOVE>/health"
curl -sk "https://<ALB_ADDRESS_FROM_ABOVE>/ready"
curl -sk "https://<ALB_ADDRESS_FROM_ABOVE>/api/categories"
```

Then open `https://<ALB_ADDRESS_FROM_ABOVE>/` in a browser and walk through the same flows
validated locally during development: homepage, product search, cart, checkout, seller
dashboard, admin dashboard.

## 11. Troubleshooting

See `k8s/README.md`'s own Troubleshooting table for anything cluster/manifest-shaped. Two things
specific to this live-activation flow:

| Symptom | Likely cause |
|---|---|
| `release.yml`'s `update-gitops-manifests` job fails to push | The default `GITHUB_TOKEN` needs `contents: write` (already set in `release.yml`'s `permissions:` block) — if it still fails, check the repo's Settings → Actions → General → Workflow permissions hasn't been locked to read-only at the org/repo level |
| Argo CD Application stuck `Progressing` after a sync | Usually the `nexamarket-db-migrate` `PreSync` hook Job still running or failing — `kubectl logs -n <namespace> job/nexamarket-db-migrate` |
| `aws-actions/configure-aws-credentials` fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity" | The trust policy's `sub` condition (step 4) doesn't match — it's scoped to `ref:refs/heads/main` only; confirm the workflow run was actually a push to `main`, not a PR |

## 12. Teardown (if this is a throwaway demo cluster)

```bash
kubectl delete -f k8s/argocd/application-staging.yaml -f k8s/argocd/application-production.yaml
kubectl delete -f k8s/argocd/appproject.yaml

aws ecr delete-repository --repository-name nexamarket-backend --region us-east-2 --force
aws ecr delete-repository --repository-name nexamarket-frontend --region us-east-2 --force

aws iam detach-role-policy --role-name nexamarket-github-actions-release \
  --policy-arn arn:aws:iam::668484272259:policy/nexamarket-ecr-least-privilege
aws iam delete-role --role-name nexamarket-github-actions-release
aws iam delete-policy --policy-arn arn:aws:iam::668484272259:policy/nexamarket-ecr-least-privilege
```

The `nexamarket-ebs-gp3-encrypted` StorageClass's `reclaimPolicy: Retain` (see
`k8s/base/storageclass.yaml`) means the underlying EBS volume(s) will **not** be deleted
automatically by any of the above — find and delete them explicitly if this is truly a full
teardown:

```bash
aws ec2 describe-volumes --region us-east-2 \
  --filters "Name=tag:kubernetes.io/created-for/pvc/name,Values=*" \
  --query 'Volumes[].[VolumeId,Tags]'
```
