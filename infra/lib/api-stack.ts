import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { Monitoring } from './monitoring';

/**
 * Inference profile rather than a bare model id — Bedrock rejects bare ids for
 * current Claude models. Verified available in us-east-1.
 */
const BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-6';

/**
 * Named rather than `$default` so the stage prefix API Gateway expects is the
 * same path CloudFront routes on, and no rewriting sits between them.
 */
export const API_STAGE_NAME = 'api';

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

  /** Every function this stack owns, keyed by a name the dashboard can show. */
  private readonly handlers: Record<string, NodejsFunction> = {};

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Routes require a valid Cognito ID token unless they opt out explicitly.
    const authorizer = new HttpUserPoolAuthorizer('UserPoolAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer,
      createDefaultStage: false,
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

    this.httpApi.addStage('Stage', { stageName: API_STAGE_NAME, autoDeploy: true });

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

    const parser = this.addReceipts(props);

    new Monitoring(this, 'Monitoring', {
      httpApi: this.httpApi,
      functions: this.handlers,
      parser,
      table: props.table,
      alertEmail: this.node.tryGetContext('alertEmail') as string | undefined,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `${this.httpApi.apiEndpoint}/${API_STAGE_NAME}`,
    });
  }

  /**
   * Receipt upload and review, plus the parser that runs when an image lands in
   * S3. The upload goes straight from the browser to a presigned URL, so image
   * bytes never pass through the API.
   */
  private addReceipts(props: ApiStackProps): NodejsFunction {
    const api = this.createHandler('Receipts', 'receipts.ts', {
      TABLE_NAME: props.table.tableName,
      RECEIPTS_BUCKET: props.receiptsBucket.bucketName,
    });
    props.table.grantReadWriteData(api);
    props.receiptsBucket.grantPut(api);

    const integration = new HttpLambdaIntegration('ReceiptsIntegration', api);

    this.httpApi.addRoutes({
      path: '/receipts',
      methods: [apigwv2.HttpMethod.POST],
      integration,
    });
    this.httpApi.addRoutes({
      path: '/receipts/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });
    this.httpApi.addRoutes({
      path: '/receipts/{id}/confirm',
      methods: [apigwv2.HttpMethod.POST],
      integration,
    });

    // Reading an image and waiting on a vision model takes far longer than a
    // CRUD call, so this function gets its own limits.
    const parser = this.createHandler(
      'ParseReceipt',
      'parse-receipt.ts',
      { TABLE_NAME: props.table.tableName, BEDROCK_MODEL_ID },
      { timeout: cdk.Duration.minutes(2), memorySize: 1024 },
    );
    props.table.grantReadWriteData(parser);
    props.receiptsBucket.grantRead(parser);

    new events.Rule(this, 'ReceiptUploaded', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [props.receiptsBucket.bucketName] },
          object: { key: [{ prefix: 'receipts/' }] },
        },
      },
      targets: [new targets.LambdaFunction(parser)],
    });

    parser.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        // Cross-region inference fans out to regional copies of the model, so the
        // grant covers the profile and the underlying foundation models.
        resources: [
          `arn:aws:bedrock:*:${this.account}:inference-profile/${BEDROCK_MODEL_ID}`,
          'arn:aws:bedrock:*::foundation-model/anthropic.*',
        ],
      }),
    );

    return parser;
  }

  private createHandler(
    id: string,
    entryFile: string,
    environment: Record<string, string> = {},
    overrides: { timeout?: cdk.Duration; memorySize?: number } = {},
  ): NodejsFunction {
    const fn = new NodejsFunction(this, `${id}Fn`, {
      entry: path.join(HANDLERS_DIR, entryFile),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: overrides.memorySize ?? 512,
      timeout: overrides.timeout ?? cdk.Duration.seconds(10),
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        // Everything is bundled rather than assumed present: the Lambda image
        // ships only some AWS SDK clients, and an externalised-but-absent module
        // fails at import time instead of at build time.
        externalModules: [],
        // The AWS SDK is published as CommonJS and calls `require` for Node
        // builtins. ESM output has no `require`, so one is created here.
        banner:
          "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
      },
      environment: { NODE_OPTIONS: '--enable-source-maps', ...environment },
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    this.handlers[id] = fn;

    return fn;
  }
}
