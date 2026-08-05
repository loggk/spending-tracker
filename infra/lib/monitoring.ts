import * as cdk from 'aws-cdk-lib';
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

const PERIOD = cdk.Duration.minutes(5);

export interface MonitoringProps {
  httpApi: apigwv2.HttpApi;
  functions: Record<string, lambda.IFunction>;
  parser: lambda.IFunction;
  table: dynamodb.ITable;
  alertEmail?: string | undefined;
}

/** One dashboard covering the whole request path, and alarms on the two ways it fails. */
export class Monitoring extends Construct {
  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'SpendingTracker',
      defaultInterval: cdk.Duration.days(7),
    });

    const perFunction = (
      metric: (fn: lambda.IFunction, label: string) => cloudwatch.Metric,
    ): cloudwatch.Metric[] => Object.entries(props.functions).map(([name, fn]) => metric(fn, name));

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API requests',
        left: [props.httpApi.metricCount({ statistic: 'Sum', period: PERIOD })],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API errors',
        left: [
          props.httpApi.metricClientError({ statistic: 'Sum', period: PERIOD, label: '4xx' }),
          props.httpApi.metricServerError({ statistic: 'Sum', period: PERIOD, label: '5xx' }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API latency',
        left: [
          props.httpApi.metricLatency({ statistic: 'p50', period: PERIOD, label: 'p50' }),
          props.httpApi.metricLatency({ statistic: 'p95', period: PERIOD, label: 'p95' }),
        ],
        leftYAxis: { label: 'ms', showUnits: false },
        width: 8,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda invocations',
        left: perFunction((fn, label) =>
          fn.metricInvocations({ statistic: 'Sum', period: PERIOD, label }),
        ),
        stacked: true,
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda errors',
        left: perFunction((fn, label) =>
          fn.metricErrors({ statistic: 'Sum', period: PERIOD, label }),
        ),
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda duration (p95)',
        left: perFunction((fn, label) =>
          fn.metricDuration({ statistic: 'p95', period: PERIOD, label }),
        ),
        leftYAxis: { label: 'ms', showUnits: false },
        width: 8,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB capacity consumed',
        left: [
          props.table.metricConsumedReadCapacityUnits({ period: PERIOD, label: 'read' }),
          props.table.metricConsumedWriteCapacityUnits({ period: PERIOD, label: 'write' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB throttles',
        left: [props.table.metricThrottledRequestsForOperations({ period: PERIOD })],
        width: 12,
      }),
    );

    const alerts = new sns.Topic(this, 'Alerts', { displayName: 'Spending Tracker alerts' });
    if (props.alertEmail) {
      alerts.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }

    const alarms = [
      props.httpApi
        .metricServerError({ statistic: 'Sum', period: PERIOD })
        .createAlarm(this, 'ApiServerErrors', {
          alarmDescription: 'The API returned a 5xx, so a request failed in a way the user saw.',
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }),

      props.parser
        .metricErrors({ statistic: 'Sum', period: PERIOD })
        .createAlarm(this, 'ParseReceiptErrors', {
          alarmDescription: 'Receipt parsing failed; the upload will never leave `processing`.',
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }),
    ];

    for (const alarm of alarms) {
      alarm.addAlarmAction(new actions.SnsAction(alerts));
    }
  }
}
