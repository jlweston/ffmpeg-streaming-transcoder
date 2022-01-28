import * as AWS from "aws-sdk";
import { spawn } from "child_process";
import { v4 } from "uuid";
import { createReadStream, readdir } from "fs";

const S3 = new AWS.S3();
const bucketName = process.env.BUCKET_NAME || "";
const ffmpegPath = process.env.FFMPEG_PATH || "";

const getFileAsBuffer = (filepath: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const stream = createReadStream(filepath);
      stream.on("data", (data) => {
        resolve(data);
      });
    } catch (error) {
      console.log(`Failed to fetch ${filepath}`);
      reject(error);
    }
  });
};

const getNextImageFromS3 = async function* (imageFileNames: string[]) {
  for (let i = 0; i <= 20 && i <= imageFileNames.length - 1; i++) {
    const filename = imageFileNames[i];

    const { Body: body } = await S3.getObject({
      Bucket: bucketName,
      Key: filename,
    }).promise();

    if (filename.indexOf(".mp4") > 0) continue;

    yield { filename, body };
  }
};

exports.handler = async function (event: Record<string, any>) {
  const jobId = v4();

  try {
    const listObjectsResponse: AWS.S3.ListObjectsV2Output =
      await S3.listObjectsV2({
        Bucket: bucketName,
      }).promise();

    const imageFileNames =
      listObjectsResponse.Contents?.map((object) => object.Key as string) || [];

    const uploadFromFile = async (filepath: string): Promise<void> => {
      await S3.putObject({
        ACL: "private",
        Body: await getFileAsBuffer(filepath),
        Bucket: bucketName,
        ContentType: "application/zip",
        Key: `${jobId}.mp4`,
      }).promise();
    };

    await new Promise(async (resolve, reject) => {
      // spawn a child process to which we'll stream individual frames
      console.log("creating child process");
      const ffmpeg = spawn(
        ffmpegPath,
        [
          "-r",
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
          "-f",
          "mp4",
          "/tmp/video.mp4",
        ],
        { stdio: "pipe" }
      );

      ffmpeg.stdin.on("close", async () => {
        console.log(">>>> childProcess.stdin ended");
        readdir("/tmp", (err, files) => {
          files.forEach((file) => {
            console.log(file);
          });
        });
        await uploadFromFile("/tmp/video.mp4");
        resolve("rendered video uploaded to S3");
      });

      console.log("pushing frames to pipe");
      for await (const image of getNextImageFromS3(imageFileNames)) {
        console.log("🚀 > forawait > image", image.filename);
        const body = image.body as Buffer;
        // console.log("🚀 > forawait > image.body.length", body.length);
        // const png = await jimp.read(image.body as Buffer);
        // const bmp = await png.getBufferAsync(jimp.MIME_BMP);
        ffmpeg.stdin.write(body);
      }
      ffmpeg.stdin.end();
      console.log("done pushing frames to pipe");
    });

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
