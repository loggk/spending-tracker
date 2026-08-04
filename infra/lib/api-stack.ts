import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

const HANDLERS_DIR = path.join(import.meta.dirname, '../../backend/src/handlers');

export interface ApiStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  receiptsBucket: s3.Bucket;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

/** The HTTP API and the Lambda functions behind it. */
export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Routes require a valid Cognito ID token unless they opt out explicitly.
    const authorizer = new HttpUserPoolAuthorizer('UserPoolAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: ['http://localhost:5173'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Unauthenticated on purpose: lets us verify the deploy pipeline end to end
    // without needing a signed-in user.
    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'HealthIntegration',
        this.createHandler('Health', 'health.ts'),
      ),
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    this.httpApi.addRoutes({
      path: '/me',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('MeIntegration', this.createHandler('Me', 'me.ts')),
    });

    // One function per resource, dispatching internally on the route key. Each
    // gets least-privilege access to only the table.
    for (const resource of ['transactions', 'categories'] as const) {
      const id = resource === 'transactions' ? 'Transactions' : 'Categories';
      const fn = this.createHandler(id, `${resource}.ts`, {
        TABLE_NAME: props.table.tableName,
      });
      props.table.grantReadWriteData(fn);

      const integration = new HttpLambdaIntegration(`${id}Integration`, fn);

      this.httpApi.addRoutes({
        path: `/${resource}`,
        methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
        integration,
      });

      this.httpApi.addRoutes({
        path: `/${resource}/{id}`,
        methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
        integration,
      });

      // Bulk create for CSV import. The literal path is matched ahead of
      // /transactions/{id}, so it never collides with a single-item route.
      if (resource === 'transactions') {
        this.httpApi.addRoutes({
          path: '/transactions/batch',
          methods: [apigwv2.HttpMethod.POST],
          integration,
        });
      }
    }

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }

  private createHandler(
    id: string,
    entryFile: string,
    environment: Record<string, string> = {},
  ): NodejsFunction {
    return new NodejsFunction(this, `${id}Fn`, {
      entry: path.join(HANDLERS_DIR, entryFile),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      bundling: { format: OutputFormat.ESM, minify: true, sourceMap: true },
      environment: { NODE_OPTIONS: '--enable-source-maps', ...environment },
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
  }
}
