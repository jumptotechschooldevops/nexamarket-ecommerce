# GitHub Secrets & Variables setup

**Not run.** Every `gh` command below is documented for the live masterclass session, not
executed while preparing this repository. Run these against
`jumptotechschooldevops/nexamarket-ecommerce` once the AWS side (OIDC provider, IAM role, ECR
repos — see `demo-setup/aws/`) actually exists.

## Why some of these are Secrets and others are Variables

GitHub Actions has two separate stores for this, and mixing them up either leaks something that
didn't need to be secret or — more commonly — hides something in logs/review that should have
been visible. The rule applied below: **if knowing the value alone lets you do something harmful,
it's a Secret; if it's just an identifier or a public endpoint, it's a Variable.** An IAM role
ARN or an AWS account ID identify something; they don't grant anything by themselves (the role's
own trust policy, in `demo-setup/aws/github-oidc-trust-policy.json`, is what actually controls
who can assume it) — so they're Variables, deliberately visible in workflow run logs and in the
repo settings UI to anyone with read access, which is also just more convenient to debug with.

## Secrets (`gh secret set`)

| Name | Value | Used by |
|---|---|---|
| `SONAR_TOKEN` | A SonarQube user token (Administration → Security → Users → Tokens) with Execute Analysis permission on this project | `demo-setup/workflows/ci.yml` |

```bash
# Run interactively so the token is never typed into shell history:
gh secret set SONAR_TOKEN --repo jumptotechschooldevops/nexamarket-ecommerce
```

That's the only Secret this setup needs. There is deliberately **no long-lived AWS access key
Secret** — `demo-setup/workflows/release.yml` authenticates to AWS via OIDC
(`aws-actions/configure-aws-credentials` + the trust policy in `demo-setup/aws/`), which is the
entire point of setting OIDC up: nothing AWS-credential-shaped needs to live in GitHub at all.

## Variables (`gh variable set`)

| Name | Value | Used by |
|---|---|---|
| `AWS_REGION` | `us-east-2` | `demo-setup/workflows/release.yml` (also hardcoded there as a fallback — see its `env:` block) |
| `AWS_OIDC_ROLE_ARN` | `arn:aws:iam::668484272259:role/<ROLE_NAME_FROM_MASTERCLASS>` — the role created from `demo-setup/aws/github-oidc-trust-policy.json` + `ecr-least-privilege-policy.json` | `demo-setup/workflows/release.yml` |
| `SONAR_HOST_URL` | Your SonarQube server's URL (e.g. `https://sonar.<your-domain>` or SonarCloud's `https://sonarcloud.io`) | `demo-setup/workflows/ci.yml` |

```bash
gh variable set AWS_REGION --repo jumptotechschooldevops/nexamarket-ecommerce --body "us-east-2"

gh variable set AWS_OIDC_ROLE_ARN --repo jumptotechschooldevops/nexamarket-ecommerce \
  --body "arn:aws:iam::668484272259:role/<ROLE_NAME_FROM_MASTERCLASS>"

gh variable set SONAR_HOST_URL --repo jumptotechschooldevops/nexamarket-ecommerce \
  --body "<YOUR_SONARQUBE_SERVER_URL>"
```

## Verifying what's set (without revealing Secret values)

```bash
gh secret list --repo jumptotechschooldevops/nexamarket-ecommerce
gh variable list --repo jumptotechschooldevops/nexamarket-ecommerce
```

`gh secret list` only ever shows names and last-updated timestamps, never values — there is no
`gh` command that prints a Secret's value once set, by design.
