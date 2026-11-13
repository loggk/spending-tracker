import * as cdk from 'aws-cdk-lib';
import { API_STAGE_NAME, ApiStack, BEDROCK_MODEL_ID } from '../lib/api-stack';
import { DataAuthStack } from '../lib/data-auth-stack';
import { EmailIngestStack } from '../lib/email-ingest-stack';
import { GithubDeployStack } from '../lib/github-deploy-stack';
import { WebStack } from '../lib/web-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const dataAuth = new DataAuthStack(app, 'SpendingTracker-DataAuth', { env });

/**
 * Email ingestion needs somewhere for mail to arrive, so it is only built once
 * a domain is configured in context. Without it the rest of the app deploys
 * unchanged and the review queue simply stays empty — which keeps `cdk synth`
 * working on a checkout that has not picked a domain yet.
 */
const ingestDomain = app.node.tryGetContext('ingestDomain') as string | undefined;
const hostedZoneId = app.node.tryGetContext('ingestHostedZoneId') as string | undefined;
const hostedZoneName = app.node.tryGetContext('ingestHostedZoneName') as string | undefined;

const emailIngest =
  ingestDomain && hostedZoneId
    ? new EmailIngestStack(app, 'SpendingTracker-EmailIngest', {
        env,
        table: dataAuth.table,
        inboundEmailBucket: dataAuth.inboundEmailBucket,
        ingestDomain,
        hostedZoneId,
        // Defaults to the ingest domain itself, for the case where it is its own
        // zone rather than a subdomain of one.
        hostedZoneName: hostedZoneName ?? ingestDomain,
        bedrockModelId: BEDROCK_MODEL_ID,
      })
    : undefined;

const api = new ApiStack(app, 'SpendingTracker-Api', {
  env,
  table: dataAuth.table,
  receiptsBucket: dataAuth.receiptsBucket,
  userPool: dataAuth.userPool,
  userPoolClient: dataAuth.userPoolClient,
  ingestDomain,
  ingestFunction: emailIngest?.ingestFunction,
});

new WebStack(app, 'SpendingTracker-Web', {
  env,
  httpApi: api.httpApi,
  apiStageName: API_STAGE_NAME,
});

new GithubDeployStack(app, 'SpendingTracker-GithubDeploy', {
  env,
  repositories: app.node.getContext('githubRepositories') as string[],
  branch: 'main',
});

app.synth();
