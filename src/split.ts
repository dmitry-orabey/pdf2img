import { promises as fsAsync } from "fs";
import AWS from "aws-sdk";
import exec from "await-exec";
import { S3Handler } from "aws-lambda";
import path from "path";
import { sendMail } from "./email.utils";

const s3 = new AWS.S3();

const saveToTmp = async (params: AWS.S3.GetObjectRequest) => {
  const data = await s3.getObject(params).promise();
  await fsAsync.writeFile(`/tmp/${params.Key}`, data.Body);
};

const saveResult = async (distFolderPath: string) => {
  const files = await fsAsync.readdir(distFolderPath);
  if (!files || files.length === 0) {
    console.log(
      `provided folder '${distFolderPath}' is empty or does not exist.`
    );
    console.log("Make sure your project was compiled!");
    return;
  }

  for (const fileName of files) {
    const filePath = path.join(distFolderPath, fileName);
    const fileContent = await fsAsync.readFile(filePath);
    await s3
      .putObject({
        Bucket: process.env.PAGES_BUCKET,
        Key: fileName,
        Body: fileContent,
      })
      .promise();

    console.log(`Successfully uploaded '${fileName}'!`);
  }
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

  try {
    await saveToTmp({ Bucket: bucket, Key: srcKey });

    const result = await exec(`pdfinfo /tmp/${srcKey}`);

    const totalPages = result.stdout.match(/Pages:\s*(.*)\n/)[1];
    const batch = 50;
    const pages = [...Array(Math.ceil(totalPages / batch)).keys()];

    for (const page of pages) {
      let l = (page + 1) * batch;
      if (l > totalPages) l = totalPages;
      const res = await exec(
        `mkdir -p /tmp/${dstPrefix} && pdfseparate -f ${
          page * batch + 1
        } -l ${l} /tmp/${srcKey} /tmp/${dstPrefix}/${dstPrefix}--separator--%d.pdf`
      );
      console.log(res);
      await saveResult(`/tmp/${dstPrefix}`);
      console.log("save result");
      await exec(`rm -rf /tmp/${dstPrefix}`);
      console.log("remove");
    }
  } catch (error) {
    console.log(error);
    sendMail(`Can't split pdf ${srcKey}. Error stack: ${error.stack}`);
  }
};
