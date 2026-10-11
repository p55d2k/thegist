const nodemailer = require("nodemailer");

const testEmail = async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GOOGLE_USER_EMAIL,
        pass: process.env.GOOGLE_APP_PASSWORD,
      },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"The Gist" <${process.env.GOOGLE_USER_EMAIL}>`,
      to: process.env.GOOGLE_USER_EMAIL,
      subject: "Test Newsletter",
      text: "This is a test email to verify the Gmail setup works.",
      html: "<h1>This is a test email</h1><p>Verify the Gmail setup works.</p>",
    });

    console.log("Test email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Accepted:", info.accepted);
    console.log("Rejected:", info.rejected);
  } catch (error) {
    console.error("Error sending test email:", error.message);
    process.exit(1);
  }
};

testEmail();
