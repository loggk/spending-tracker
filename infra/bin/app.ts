import * as cdk from 'aws-cdk-lib';
import { API_STAGE_NAME, ApiStack } from '../lib/api-stack';
import { DataAuthStack } from '../lib/data-auth-stack';
import { GithubDeployStack } from '../lib/github-deploy-stack';
import { WebStack } from '../lib/web-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const dataAuth = new DataAuthStack(app, 'SpendingTracker-DataAuth', { env });

const api = new ApiStack(app, 'SpendingTracker-Api', {
  env,
  table: dataAuth.table,
  receiptsBucket: dataAuth.receiptsBucket,
  userPool: dataAuth.userPool,
  userPoolClient: dataAuth.userPoolClient,
});

new WebStack(app, 'SpendingTracker-Web', {
  env,
  httpApi: api.httpApi,
  apiStageName: API_STAGE_NAME,
});

new GithubDeployStack(app, 'SpendingTracker-GithubDeploy', {
  env,
  repository: app.node.getContext('githubRepo') as string,
  branch: 'main',
});

app.synth();
