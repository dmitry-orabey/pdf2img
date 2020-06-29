import fs from "fs";
// import ss from "stringstream";
import AWS from "aws-sdk";
import exec from "await-exec";
// import os from "os";
// import path from "path";
import { S3Handler } from "aws-lambda";
// import { Stream, Readable, PassThrough } from "stream";
import path from "path";

const s3 = new AWS.S3();

const saveToTmp = async (params: AWS.S3.GetObjectRequest) => {
  return new Promise((resolve) => {
    console.log(params);
    s3.getObject(params, (err, data) => {
      if (err) {
        console.error("1", err.code, "-", err.message);
      }

      fs.writeFile(`/tmp/${params.Key}`, data.Body, (e) => {
        if (e) console.log("2", e.code, "-", e.message);
        resolve();
      });
    });
  });
};

// const convertPDF = async (fileName: string, dst: string) => {
//   const test = await exec("gs -h");
//   console.log("test!!!", test);
//   const result = await exec(
//     `mkdir -p /tmp/${dst} && gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -r600 -dDownScaleFactor=3 -dUseCropBox -sOutputFile=/tmp/${dst}/%03d.jpg /tmp/${fileName}`
//     // `mkdir -p /tmp/${dst} && gs -sDEVICE=pnggray -r600 -dPDFSETTINGS=/screen -dNumRenderingThreads=2 -dMaxPatternBitmap=100000 -o /tmp/${dst}/%03d.png -f /tmp/${fileName} -c "3000000000 setvmthreshold"`
//   );

//   console.log("!!!!!", result);
//   return result;
// };

const saveResult = async (distFolderPath: string, dstFolder: string) => {
  return new Promise((resolve) => {
    fs.readdir(distFolderPath, (err, files) => {
      if (err) console.log(err);
      if (!files || files.length === 0) {
        console.log(
          `provided folder '${distFolderPath}' is empty or does not exist.`
        );
        console.log("Make sure your project was compiled!");
        resolve();
        return;
      }

      // eslint-disable-next-line
      for (const fileName of files) {
        // get the full path of the file
        const filePath = path.join(distFolderPath, fileName);

        // // ignore if directory
        // if (fs.lstatSync(filePath).isDirectory()) {
        //   continue;
        // }

        // read file contents
        // eslint-disable-next-line
        fs.readFile(filePath, (error, fileContent) => {
          // if unable to read file contents, throw exception
          if (error) {
            throw error;
          }

          // upload file to S3
          s3.putObject(
            {
              Bucket: process.env.IMG_BUCKET,
              Key: `${dstFolder}/${fileName}`,
              Body: fileContent,
            },
            () => {
              console.log(`Successfully uploaded '${fileName}'!`);
            }
          );
        });
      }
    });
  });
};

export const index: S3Handler = async (event) => {
  console.log(event);
  const bucket = event.Records[0].s3.bucket.name;
  const srcKey = event.Records[0].s3.object.key;
  const dstPrefix = `${srcKey.replace(/\.\w+$/, "")}`;
  const fileType = srcKey.slice(-3, srcKey.length);

  if (!fileType || fileType !== "pdf") {
    console.log(`Invalid filetype found for key: ${srcKey}`);
  }

  console.log(bucket, srcKey, dstPrefix, fileType);

  await saveToTmp({ Bucket: bucket, Key: srcKey });

  const result = await exec(
    `mkdir -p /tmp/${dstPrefix} && pdftocairo -jpeg -r 200 -jpegopt "quality=80" "/tmp/${srcKey}" "/tmp/${dstPrefix}/img"`
  );

  console.log("res", result);

  await saveResult(`/tmp/${dstPrefix}`, dstPrefix);

  // console.log("saved to tmp");

  // await convertPDF(srcKey, dstPrefix);
  // console.log("converted");
  // await saveResult(`/tmp/${dstPrefix}`, dstPrefix);
  // console.log("saved result");
};
