import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
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

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
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

    const health = this.createHandler('Health', 'health.ts');

    // Unauthenticated on purpose: lets us verify the deploy pipeline end to end
    // without needing a signed-in user.
    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', health),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }

  private createHandler(id: string, entryFile: string): NodejsFunction {
    return new NodejsFunction(this, `${id}Fn`, {
      entry: path.join(HANDLERS_DIR, entryFile),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      bundling: { format: OutputFormat.ESM, minify: true, sourceMap: true },
      environment: { NODE_OPTIONS: '--enable-source-maps' },
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
  }
}
