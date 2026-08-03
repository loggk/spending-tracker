import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();

// Stacks are registered here as they are built (see lib/):
//   DataAuthStack — DynamoDB table, receipts bucket, Cognito user pool
//   ApiStack      — Lambdas, HTTP API, JWT authorizer, monitoring
//   WebStack      — frontend hosting (S3 + CloudFront)

app.synth();
