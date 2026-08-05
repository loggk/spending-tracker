# Spending Tracker

A serverless personal finance app for tracking spending — replacing my Excel workflow with a fast web UI, spending dashboards, and AI-powered receipt scanning.

## Features

- **Quick transaction entry** — add purchases in seconds with a spreadsheet-style quick-add row
- **Custom categories** — organize spending your way
- **Dashboard** — spending by category and over time, with flexible date ranges
- **CSV import/export** — migrate existing spreadsheet data in and out freely
- **Receipt scanning** — upload a photo of a receipt and Claude (via Amazon Bedrock) itemizes it and suggests a category per line item
- **Secure by default** — Cognito authentication; every record is scoped to the signed-in user

## Architecture

Fully serverless on AWS, defined end-to-end with the AWS CDK:

```
                        ┌──────────────────────────────┐
  Browser ─────────────▶│          CloudFront          │
                        └───────┬──────────────┬───────┘
                           /*   │              │   /api/*
                                ▼              ▼
                   ┌────────────────┐   ┌──────────────────┐
                   │ S3 (React app) │   │   API Gateway    │
                   └────────────────┘   │  JWT authorizer  │
                                        └────────┬─────────┘
                                                 ▼
                                        ┌──────────────┐   ┌───────────┐
                                        │   Lambdas    │──▶│ DynamoDB  │
                                        └──────────────┘   └───────────┘

                        ┌───────────────┐             ┌──────────────┐   ┌─────────┐
  Browser ──presigned──▶│ S3 (receipts) │──EventBridge│ parseReceipt │──▶│ Bedrock │
             PUT        └───────────────┘         ───▶│    Lambda    │   │ (Claude)│
                                                      └──────┬───────┘   └─────────┘
                                                             ▼
                                                         DynamoDB
```

A few decisions worth calling out:

- **One origin.** CloudFront serves the app and proxies the API under `/api`, so the browser never makes a cross-origin request in production — no preflight, and no need to feed a generated CloudFront domain back into the API's allowed origins.
- **Images never touch the API.** Uploads go straight from the browser to S3 through a presigned URL; the parser is triggered by an EventBridge event once the object lands.
- **Single-table DynamoDB.** Transactions, categories, and receipts share one table, partitioned by Cognito user with type-prefixed sort keys, so a date range is one query and no data can leak between users.

## Tech Stack

| Layer          | Technology                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Frontend       | React + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts |
| Hosting        | Amazon S3 + CloudFront                                                      |
| API            | Amazon API Gateway (HTTP API) + AWS Lambda (Node.js, TypeScript)            |
| Auth           | Amazon Cognito (JWT authorizer)                                             |
| Database       | Amazon DynamoDB (single-table design)                                       |
| AI             | Amazon Bedrock (Claude) for receipt parsing                                 |
| Infrastructure | AWS CDK (TypeScript)                                                        |
| Monitoring     | Amazon CloudWatch (dashboard + alarms)                                      |
| CI/CD          | GitHub Actions with OIDC — no long-lived AWS keys                           |

## Repository Layout

```
frontend/    React SPA
backend/     Lambda handlers and business logic
infra/       AWS CDK stacks
shared/      Types shared between frontend and backend
.github/     CI and deployment workflows
```

## Getting Started

### Prerequisites

- Node.js 20+
- An AWS account with the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed
- Access to Anthropic Claude models in Amazon Bedrock (used by the receipt parser)

### AWS credentials

This project authenticates through IAM Identity Center, so no long-lived access keys
are stored on disk. Configure a profile once:

```bash
aws configure sso
```

Use `us-east-1` as both the SSO region and the CLI default region, and name the
profile `spending-tracker`. Then export it for your shell session:

```bash
export AWS_PROFILE=spending-tracker
```

Credentials are short-lived. Refresh them whenever commands start failing on auth:

```bash
aws sso login
```

### Install and bootstrap

```bash
npm install
npx cdk bootstrap
```

`cdk bootstrap` provisions the deployment resources CDK needs in your account, and
only has to run once per account and region.

### First deploy

The frontend compiles the Cognito ids into its bundle, so the stacks that own those
ids have to exist before the bundle that uses them. The first deploy is therefore two
passes; every deploy after that is one.

```bash
# 1. Build a placeholder bundle so every stack can synthesize, then deploy.
npm run build -w frontend
npm run deploy -w infra

# 2. Point the frontend at what was just created and redeploy it.
cp frontend/.env.example frontend/.env   # fill in from the stack outputs
npm run build -w frontend
npm run deploy -w infra
```

The `SiteUrl` output is the live app. The deploy workflow does both passes in one
run, so this dance is only for a local first-time setup.

### Local development

With `frontend/.env` filled in, the dev server talks to the deployed API directly:

```bash
npm run dev
```

## Stacks

| Stack                          | Contents                                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| `SpendingTracker-DataAuth`     | DynamoDB table, receipts bucket, Cognito user pool — all retained on delete |
| `SpendingTracker-Api`          | HTTP API, Lambda functions, EventBridge rule, CloudWatch dashboard + alarms |
| `SpendingTracker-Web`          | Site bucket, CloudFront distribution, deployment of the built frontend      |
| `SpendingTracker-GithubDeploy` | OIDC provider and the role GitHub Actions assumes                           |

## Continuous deployment

Pull requests run [`ci.yml`](.github/workflows/ci.yml); merges to `main` run
[`deploy.yml`](.github/workflows/deploy.yml), which verifies and then deploys. Both
call the same reusable [`verify.yml`](.github/workflows/verify.yml), so the checks
that gate a PR are exactly the checks that gate a deploy.

The deploy job holds no AWS credentials. It presents a short-lived OIDC token that
identifies the repository and branch, and AWS exchanges it for temporary keys. The
role itself can do nothing except assume the roles created by `cdk bootstrap`.

To wire it up:

1. Set `githubRepo` in [`infra/cdk.json`](infra/cdk.json) to your `owner/repo`.
2. Deploy `SpendingTracker-GithubDeploy` once from your machine — CI cannot create
   the role it needs to authenticate with.
3. Add a repository variable `AWS_DEPLOY_ROLE_ARN` with the stack's `DeployRoleArn`
   output. Optionally set `AWS_REGION`; it defaults to `us-east-1`.

If your account already has a GitHub OIDC provider, delete the `OpenIdConnectProvider`
from the stack and reference the existing one — an account may only have one per issuer.

## Monitoring

The `SpendingTracker` CloudWatch dashboard covers API request volume, errors, and
latency; per-function Lambda invocations, errors, and duration; and DynamoDB capacity
and throttles.

Two alarms publish to an SNS topic — one on API 5xx responses, and one on parser
failures, which are invisible to the API because that function runs off an event
rather than a request. Subscribe an address to get the notifications:

```bash
npm run deploy -w infra -- -c alertEmail=you@example.com
```

## Common commands

| Command                   | Description                         |
| ------------------------- | ----------------------------------- |
| `npm run dev`             | Start the frontend dev server       |
| `npm run build`           | Build all workspaces                |
| `npm run typecheck`       | Type-check all workspaces           |
| `npm run lint`            | Lint the repository                 |
| `npm run format`          | Format with Prettier                |
| `npm test`                | Run the test suites                 |
| `npm run deploy -w infra` | Deploy all CDK stacks               |
| `npm run diff -w infra`   | Show pending infrastructure changes |
