import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_OIDC_ISSUER = 'token.actions.githubusercontent.com';

export interface GithubDeployStackProps extends cdk.StackProps {
  repositories: string[];
  branch: string;
}

/**
 * The trust needed for GitHub Actions to deploy without credentials.
 */
export class GithubDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubDeployStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubProvider', {
      url: `https://${GITHUB_OIDC_ISSUER}`,
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'spending-tracker-github-deploy',
      description: 'Assumed by GitHub Actions to deploy the CDK stacks',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          [`${GITHUB_OIDC_ISSUER}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_ISSUER}:sub`]: props.repositories.map(
            (repository) => `repo:${repository}:ref:refs/heads/${props.branch}`,
          ),
        },
      }),
    });

    // `cdk deploy` does its real work through the roles created by
    // `cdk bootstrap`, so this role needs permission to assume those.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    // The CLI checks the bootstrap version before it assumes anything.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:*:${this.account}:parameter/cdk-bootstrap/*`],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
