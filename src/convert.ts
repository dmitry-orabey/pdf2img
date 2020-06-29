import { promises as fsAsync } from "fs";
import AWS from "aws-sdk";
import exec from "await-exec";
import { S3Handler } from "aws-lambda";
import path from "path";
import { createClient } from "node-ses";

const s3 = new AWS.S3();
const client = createClient({
  key: process.env.SES_KEY,
  secret: process.env.SES_SECRET,
  amazon: `https://email.${process.env.AWS_REGION}.amazonaws.com`,
});

const sendMail = async (message: string) => {
  return new Promise((resolve, reject) => {
    client.sendEmail(
      {
        to: process.env.RECEIVER_EMAIL,
        from: process.env.SENDER_EMAIL,
        subject: "Pdf to image convertion",
        message,
        altText: "plain text",
      },
      (err, data) => {
        if (err) reject(err);

        resolve(data);
      }
    );
  });
};

const saveToTmp = async (params: AWS.S3.GetObjectRequest) => {
  const data = await s3.getObject(params).promise();
  await fsAsync.writeFile(`/tmp/${params.Key}`, data.Body);
};

const deleteObject = async (
  params: AWS.S3.DeleteObjectRequest,
  folder: string
) => {
  console.log("delete", params);
  await s3.deleteObject(params).promise();
  await exec(`rm -rf ${folder}`);
};

const saveResult = async (distFolderPath: string, folder: string) => {
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
        Bucket: process.env.IMG_BUCKET,
        Key: `${folder}/${fileName}`,
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

    const splitted = dstPrefix.split("--separator--");

    await exec(
      `mkdir -p /tmp/${
        splitted[0]
      } && pdftocairo -jpeg -r 200 -singlefile -cropbox -jpegopt "quality=80" "/tmp/${srcKey}" "/tmp/${splitted.join(
        "/"
      )}"`
    );

    await saveResult(`/tmp/${splitted[0]}`, splitted[0]);

    await deleteObject({ Bucket: bucket, Key: srcKey }, `/tmp/${splitted[0]}`);

    // await sendMail(`Success ${bucket} ${srcKey}`);
  } catch (error) {
    console.log(error);
    sendMail(
      `Can't convert pdf ${srcKey} to image. Error stack: ${error.stack}`
    );
  }
};
