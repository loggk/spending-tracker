import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { DataAuthStack } from '../lib/data-auth-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const dataAuth = new DataAuthStack(app, 'SpendingTracker-DataAuth', { env });

new ApiStack(app, 'SpendingTracker-Api', {
  env,
  table: dataAuth.table,
  receiptsBucket: dataAuth.receiptsBucket,
  userPool: dataAuth.userPool,
  userPoolClient: dataAuth.userPoolClient,
});

app.synth();
