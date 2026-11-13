import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

const HANDLERS_DIR = path.join(import.meta.dirname, '../../backend/src/handlers');

export interface HandlerOverrides {
  timeout?: cdk.Duration;
  memorySize?: number;
}

/**
 * Every Lambda in this project, built the same way.
 *
 * Shared rather than duplicated per stack because the bundling settings below
 * are not preferences — each one is working around something specific, and a
 * second copy that drifts from this one fails at import time in the deployed
 * function rather than at build time.
 */
export function createHandler(
  scope: Construct,
  id: string,
  entryFile: string,
  environment: Record<string, string> = {},
  overrides: HandlerOverrides = {},
): NodejsFunction {
  return new NodejsFunction(scope, `${id}Fn`, {
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
      banner: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
    },
    environment: { NODE_OPTIONS: '--enable-source-maps', ...environment },
    logGroup: new logs.LogGroup(scope, `${id}Logs`, {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    }),
  });
}
