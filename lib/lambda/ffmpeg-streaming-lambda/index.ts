import * as AWS from "aws-sdk";
import * as jimp from "jimp";
import { Stream, PassThrough } from "stream";
import { spawn } from "child_process";
import { v4 } from "uuid";
// import * as ffmpeg from "fluent-ffmpeg";
// import * as ffmpegPath from "ffmpeg-static";

import { Converter } from "ffmpeg-stream";

const S3 = new AWS.S3();
const bucketName = process.env.BUCKET_NAME || "";

exports.handler = async function (event: Record<string, any>) {
  const jobId = v4();

  try {
    const listObjectsResponse: AWS.S3.ListObjectsV2Output =
      await S3.listObjectsV2({
        Bucket: bucketName,
      }).promise();

    const imageFileNames =
      listObjectsResponse.Contents?.map((object) => object.Key as string) || [];

    const getNextImageFromS3 = async function* (imageFileNames: string[]) {
      for (let i = 0; i <= imageFileNames.length - 1; i++) {
        const filename = imageFileNames[i];

        const { Body: body } = await S3.getObject({
          Bucket: bucketName,
          Key: filename,
        }).promise();

        if (filename.indexOf(".mp4") > 0) continue;

        yield { filename, body };
      }
    };

    const s3BodyPassthrough = new Stream.PassThrough();

    s3BodyPassthrough.on("end", () => {
      console.log(">>>> s3BodyPassthrough ended");
    });

    s3BodyPassthrough.on("data", (data) => {
      console.log(">>>> s3BodyPassthrough data: ", data);
    });

    s3BodyPassthrough.on("error", (error) => {
      console.log(">>>> s3BodyPassthrough error: ", error);
    });

    const uploadFromStream = async () => {
      await S3.putObject({
        ACL: "private",
        Body: s3BodyPassthrough,
        Bucket: bucketName,
        ContentType: "application/zip",
        Key: `${jobId}.mp4`,
      });
    };

    const converter = new Converter();

    // const converterOutputStream = converter.createOutputStream({
    //   vcodec: "libx264",
    //   pix_fmt: "yuv420p",
    // });

    converter.createOutputToFile(`${jobId}.mp4`, {
      vcodec: "libx264",
      pix_fmt: "yuv420p",
    });

    // converterOutputStream.pipe(s3BodyPassthrough);

    // converterOutputStream.on("end", async () => {
    //   console.log(">>>> converterOutputStream ended");
    //   await uploadFromStream();
    // });

    // converterOutputStream.on("data", (data) => {
    //   console.log(">>>> converterOutputStream data: ", data);
    // });

    // converterOutputStream.on("error", (error) => {
    //   console.log(">>>> converterOutputStream error: ", error);
    // });

    const converterInputStream = converter.createInputStream({
      f: "image2pipe",
      r: 30,
    });

    converterInputStream.on("end", () => {
      console.log(">>>> converterInputStream ended");
      uploadFromStream();
    });

    converterInputStream.on("data", (data) => {
      console.log(">>>> converterInputStream data: ", data);
    });

    converterInputStream.on("error", (error) => {
      console.log(">>>> converterInputStream error: ", error);
    });

    const images = getNextImageFromS3(imageFileNames);

    // spawn a child process to which we'll stream individual frames
    // console.log("creating child process");
    // const childProcess = spawn(
    //   ffmpegPath.default,
    //   [
    //     "-y",
    //     "-f",
    //     "mp4",
    //     "-s 1920x1080",
    //     "-framerate 30",
    //     "-pix_fmt yuv420p",
    //     // "-i /tmp/audio.mp3",
    //     // audio args
    //     "-i pipe:0",
    //     "-vcodec",
    //     "h.264",
    //     "pipe:1",
    //   ],
    //   { stdio: "pipe" }
    // );

    // converter.createOutputToFile(`${jobId}.mp4`, {});

    console.log("pushing frames to pipe");
    for await (const image of images) {
      console.log("🚀 > forawait > image", image);
      const body = image.body as Buffer;
      console.log("🚀 > forawait > image.body.length", body.length);
      // const png = await jimp.read(image.body as Buffer);
      // const bmp = await png.getBufferAsync(jimp.MIME_BMP);
      // console.log("🚀 > forawait > bmp", bmp);
      converterInputStream.write(image.body, "buffer");
    }
    converterInputStream.end();
    console.log("done pushing frames to pipe");

    await converter.run();

    const body = {
      images: listObjectsResponse.Contents?.map(function (e) {
        return e.Key;
      }),
    };
    return {
      statusCode: 200,
      headers: {},
      body: JSON.stringify(body),
    };
  } catch (error: any) {
    console.log("error inside catch: ", error);
    const body = error.stack || JSON.stringify(error, null, 2);
    return {
      statusCode: 400,
      headers: {},
      body: JSON.stringify(body),
    };
  }
};
