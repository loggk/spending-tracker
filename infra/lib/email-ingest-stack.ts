import * as cdk from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as cr from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import { createHandler } from './handler-function';

/** Where SES writes inbound messages, and the prefix the parser reads back. */
const INBOUND_PREFIX = 'inbound/';

export interface EmailIngestStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  inboundEmailBucket: s3.Bucket;
  /** Domain or subdomain receiving alerts, e.g. `ingest.example.com`. */
  ingestDomain: string;
  /** Hosted zone the records go in — usually the parent of `ingestDomain`. */
  hostedZoneId: string;
  hostedZoneName: string;
  bedrockModelId: string;
}

/**
 * Inbound email: DNS, the SES receipt rule, and the parser behind it.
 *
 * Separate from the API stack because this is the only part of the system with
 * account-global state. SES keeps exactly one *active* receipt rule set per
 * account per region, so deploying this takes over inbound mail handling for
 * the region — worth being able to see, diff and destroy on its own.
 */
export class EmailIngestStack extends cdk.Stack {
  readonly ingestFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: EmailIngestStackProps) {
    super(scope, id, props);

    const zone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    // SES will not accept mail for a domain it has not verified. Pointing the
    // identity at the hosted zone makes CDK write the DKIM records that prove
    // ownership, so verification needs no manual step.
    new ses.EmailIdentity(this, 'IngestIdentity', {
      identity: ses.Identity.publicHostedZone(zone),
      dkimSigning: true,
    });

    /**
     * MX records are per-name, so this claims only `ingestDomain`. Pointing the
     * apex at SES would silently take over mail for the whole domain, which is
     * why the ingest address lives on a subdomain by default.
     */
    new route53.MxRecord(this, 'InboundMx', {
      zone,
      recordName: props.ingestDomain,
      values: [{ priority: 10, hostName: `inbound-smtp.${this.region}.amazonaws.com` }],
      ttl: cdk.Duration.minutes(30),
    });

    // Reading an email and possibly waiting on a model takes far longer than a
    // CRUD call, so this gets its own limits, matching the receipt parser.
    this.ingestFunction = createHandler(
      this,
      'IngestEmail',
      'ingest-email.ts',
      {
        TABLE_NAME: props.table.tableName,
        INBOUND_BUCKET: props.inboundEmailBucket.bucketName,
        INBOUND_PREFIX,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
      { timeout: cdk.Duration.minutes(2), memorySize: 1024 },
    );

    props.table.grantReadWriteData(this.ingestFunction);
    props.inboundEmailBucket.grantRead(this.ingestFunction, `${INBOUND_PREFIX}*`);

    this.ingestFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        // Cross-region inference fans out to regional copies of the model, so the
        // grant covers the profile and the underlying foundation models.
        resources: [
          `arn:aws:bedrock:*::inference-profile/${props.bedrockModelId}`,
          'arn:aws:bedrock:*::inference-profile/us.anthropic.*',
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          'arn:aws:bedrock:*::foundation-model/anthropic.*',
        ],
      }),
    );

    const ruleSet = new ses.ReceiptRuleSet(this, 'IngestRuleSet', { dropSpam: true });

    ruleSet.addRule('Inbound', {
      // Domain-wide, because the per-user token is in the local part and SES
      // matches recipients literally.
      recipients: [props.ingestDomain],
      scanEnabled: true,
      tlsPolicy: ses.TlsPolicy.REQUIRE,
      // Order matters: SES runs actions in sequence, so the message is in S3
      // before the function that reads it is invoked. The S3 action also writes
      // the bucket policy SES needs.
      actions: [
        new sesActions.S3({
          bucket: props.inboundEmailBucket,
          objectKeyPrefix: INBOUND_PREFIX,
        }),
        new sesActions.Lambda({
          function: this.ingestFunction,
          // Asynchronous: nothing about the parse should influence whether SES
          // accepts the mail.
          invocationType: sesActions.LambdaInvocationType.EVENT,
        }),
      ],
    });

    /**
     * Selecting the active rule set is an API call with no CloudFormation
     * resource behind it, and `ReceiptRuleSet` has no property for it — a rule
     * set that exists but is not active receives nothing. Doing it here keeps it
     * from being a step in a runbook that gets missed after a rebuild.
     *
     * The delete path deactivates whatever is active, which switches inbound
     * mail off for the region. That is correct for tearing this stack down, and
     * worth knowing before running `cdk destroy`.
     */
    new cr.AwsCustomResource(this, 'ActivateRuleSet', {
      onUpdate: {
        service: '@aws-sdk/client-ses',
        action: 'SetActiveReceiptRuleSet',
        parameters: { RuleSetName: ruleSet.receiptRuleSetName },
        physicalResourceId: cr.PhysicalResourceId.of(`active-${ruleSet.receiptRuleSetName}`),
      },
      onDelete: {
        service: '@aws-sdk/client-ses',
        action: 'SetActiveReceiptRuleSet',
        // Omitting the name is how SES expresses "none".
        parameters: {},
      },
      // `ses:SetActiveReceiptRuleSet` does not support resource-level
      // permissions, so a wildcard is the only thing IAM accepts here.
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    new cdk.CfnOutput(this, 'IngestDomain', { value: props.ingestDomain });
    new cdk.CfnOutput(this, 'InboundMxTarget', {
      value: `inbound-smtp.${this.region}.amazonaws.com`,
    });
  }
}
