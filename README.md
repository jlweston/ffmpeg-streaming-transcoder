# ffmpeg-streaming-lambda

Creates an MP4 video file out of individual image frames streamed from S3 and
uploads the resulting video back to S3.

## Getting started

First, create a zip file containing a series of frames as PNG files.
The files should be named such that they will be listed in alphabetical order
when the Lambda function uses the S3::ListObjects operation. You can generate
frames from an existing video using the following command:

```
ffmpeg -i input-video.mp4 frames/frame-%05d.png
```

Save the zip file at `lib/assets/images.zip` so CDK's S3 Deployment can find it.

Next, run `cdk deploy` to deploy the stack. This will upload the contents of the
zip file to the target bucket and then deploy the Lambda function.

Run the lambda function from the AWS console (the test event content is not
important).

## Useful commands

- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
