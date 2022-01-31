import * as AWS from "aws-sdk";
import { spawn } from "child_process";
import { readFileSync } from "fs";

const S3 = new AWS.S3();

const bucketName = process.env.BUCKET_NAME || "";
const ffmpegPath = process.env.FFMPEG_PATH || "";

// List the paths for all of the individual frames at `bucketName/input`
const getFrameList = async (): Promise<string[]> => {
  const listObjectsResponse: AWS.S3.ListObjectsV2Output =
    await S3.listObjectsV2({
      Bucket: bucketName,
      Prefix: "input",
    }).promise();

  return (
    listObjectsResponse.Contents?.map((object) => object.Key as string) || []
  );
};

const getS3FileAsBuffer = async (filepath: string): Promise<Buffer> => {
  const { Body } = await S3.getObject({
    Bucket: bucketName,
    Key: filepath,
  }).promise();

  return Body as Buffer;
};

const getNextImageFromS3 = async function* (imageFileNames: string[] = []) {
  for (let file of imageFileNames) {
    const body = await getS3FileAsBuffer(file);

    yield { body, file };
  }
};

const renderVideo = async (output: string) => {
  const imageFileNames = await getFrameList();
  console.log("creating child process and rendering video");

  const ffmpeg = spawn(
    ffmpegPath,
    [
      "-y",
      "-framerate",
      "30",
      "-f",
      "image2pipe",
      "-color_primaries",
      "1",
      "-color_trc",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-i",
      "pipe:0",
      "-vcodec",
      "libx264",
      output,
    ],
    { stdio: "pipe" }
  );

  return new Promise(async (resolve, reject) => {
    if (!imageFileNames.length) {
      reject({ hasError: true, error: "no frames provided" });
    }

    ffmpeg.stderr.on("error", (error) => {
      console.log("error thrown by child process");
      reject(error);
    });

    // We only want to continue when ffmpeg has finished all processing, including writing to disk
    ffmpeg.on("close", () => {
      console.log("on close");
      resolve({ hasError: false, message: "success" });
    });

    ffmpeg.stdin.on("error", (error) => {
      reject({ hasError: true, error });
    });

    console.log("pushing frames to ffmpeg");
    for await (const image of getNextImageFromS3(imageFileNames)) {
      ffmpeg.stdin.write(image.body);
    }

    ffmpeg.stdin.end();
  });
};

exports.handler = async function (event: Record<string, any>) {
  const output = "/tmp/video.mp4";

  const status = await renderVideo(output);

  const body = readFileSync(output);
  console.log("uploading video to S3");

  const upload = await S3.upload({
    Bucket: bucketName,
    Key: "output/video.mp4",
    Body: body,
    ContentEncoding: "base64",
  }).promise();

  console.log("transcoded video uploaded to S3", upload);

  return {
    status,
    upload,
  };
};
