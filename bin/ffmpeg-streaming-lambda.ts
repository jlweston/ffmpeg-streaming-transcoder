#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FfmpegStreamingLambdaStack } from '../lib/ffmpeg-streaming-lambda-stack';

const app = new cdk.App();
new FfmpegStreamingLambdaStack(app, 'FfmpegStreamingLambdaStack');
