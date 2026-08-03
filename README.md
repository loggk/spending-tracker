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

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts |
| API | Amazon API Gateway (HTTP API) + AWS Lambda (Node.js, TypeScript) |
| Auth | Amazon Cognito (JWT authorizer) |
| Database | Amazon DynamoDB (single-table design) |
| AI | Amazon Bedrock (Claude) for receipt parsing |
| Infrastructure | AWS CDK (TypeScript) |
| Monitoring | Amazon CloudWatch |

## Repository Layout

```
frontend/   React SPA
backend/    Lambda handlers and business logic
infra/      AWS CDK stacks
shared/     Types shared between frontend and backend
```

## Getting Started

_Setup instructions coming as the project takes shape._
