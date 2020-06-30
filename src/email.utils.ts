import AWS from "aws-sdk";

const ses = new AWS.SES();

export const sendMail = async (message: string) => {
  return new Promise((resolve, reject) => {
    ses.sendEmail(
      {
        Source: process.env.SENDER_EMAIL,
        Destination: { ToAddresses: [process.env.RECEIVER_EMAIL] },
        Message: {
          Body: {
            Text: { Data: message },
          },
          Subject: { Data: "Pdf to image convertion" },
        },
      },
      (err, data) => {
        if (err) reject(err);

        resolve(data);
      }
    );
  });
};
