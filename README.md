# Spending Tracker

A serverless personal finance app for tracking spending — replacing my Excel workflow with a fast web UI, spending dashboards, and AI-powered receipt scanning.

> 🚧 **Status:** under active development

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
                        ┌────────────┐
  Browser ──────────────▶ CloudFront ─▶ S3 (static React app)
     │                  └────────────┘
     │  JWT (Cognito)
     ▼
┌─────────────────┐    ┌──────────┐    ┌───────────┐
│ API Gateway     │───▶│ Lambdas  │───▶│ DynamoDB  │
│ (JWT authorizer)│    │ (CRUD)   │    └───────────┘
└─────────────────┘    └──────────┘
     │ presigned PUT
     ▼
┌────────────────┐  S3 event  ┌──────────────┐   ┌─────────┐
│ S3 (receipts)  │───────────▶│ parseReceipt │──▶│ Bedrock │
└────────────────┘            │ Lambda       │   │ (Claude)│
                              └──────┬───────┘   └─────────┘
                                     ▼
                                  DynamoDB
```

## Tech Stack

| Layer          | Technology                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Frontend       | React + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts |
| API            | Amazon API Gateway (HTTP API) + AWS Lambda (Node.js, TypeScript)            |
| Auth           | Amazon Cognito (JWT authorizer)                                             |
| Database       | Amazon DynamoDB (single-table design)                                       |
| AI             | Amazon Bedrock (Claude) for receipt parsing                                 |
| Infrastructure | AWS CDK (TypeScript)                                                        |
| Monitoring     | Amazon CloudWatch                                                           |

## Repository Layout

```
frontend/   React SPA
backend/    Lambda handlers and business logic
infra/      AWS CDK stacks
shared/     Types shared between frontend and backend
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

### Deploy and configure the frontend

Deploy the stacks, then point the frontend at them:

```bash
npm run deploy -w infra
cp frontend/.env.example frontend/.env
```

Fill in `frontend/.env` with the values printed as stack outputs — `UserPoolId`,
`UserPoolClientId`, and `ApiUrl`. Then start the dev server:

```bash
npm run dev
```

### Common commands

| Command                   | Description                   |
| ------------------------- | ----------------------------- |
| `npm run dev`             | Start the frontend dev server |
| `npm run build`           | Build all workspaces          |
| `npm run typecheck`       | Type-check all workspaces     |
| `npm run lint`            | Lint the repository           |
| `npm run format`          | Format with Prettier          |
| `npm test`                | Run the test suites           |
| `npm run deploy -w infra` | Deploy all CDK stacks         |
