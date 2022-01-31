import { Construct } from "constructs";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";

import * as Lambda from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as S3 from "aws-cdk-lib/aws-s3";
import * as S3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";

export class FfmpegStreamingLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new S3.Bucket(this, "ffmpeg-streaming-bucket", {
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: S3.BucketAccessControl.PRIVATE,
    });

    const deployment = new S3Deployment.BucketDeployment(
      this,
      "ffmpeg-streaming-bucket-deployment",
      {
        sources: [
          S3Deployment.Source.asset(path.join(__dirname, "assets/images.zip")),
        ],
        destinationBucket: bucket,
        destinationKeyPrefix: "input",
        memoryLimit: 1024,
      }
    );

    // const layer = new LayerVersion(this, "chrome-aws-lambda-layer", {
    //   code: Code.fromAsset(`${__dirname}/layers/chrome_aws_lambda.zip`),
    //   compatibleRuntimes: [Runtime.NODEJS_14_X],
    // });

    const lambda = new Lambda.NodejsFunction(this, "ffmpeg-streaming-lambda", {
      entry: path.join(__dirname, "lambda/ffmpeg-streaming-lambda/index.ts"),
      bundling: {
        nodeModules: ["ffmpeg-static"],
      },
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
      handler: "handler",
      timeout: Duration.seconds(60),
      // layers: [layer],
      environment: {
        BUCKET_NAME: bucket.bucketName,
        FFMPEG_PATH: "./node_modules/ffmpeg-static/ffmpeg",
      },
    });

    bucket.grantReadWrite(lambda);

    new CfnOutput(this, "bucketName", { value: bucket.bucketName });
  }
}
