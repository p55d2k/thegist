import axios from "axios";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import {
  formatArticles,
  formatBody,
  formatRawBody,
  type FormattedArticles,
} from "@/lib/email";
import {
  getActiveSubscribers,
  createEmailSendStatus,
  updateEmailSendStatus,
} from "@/lib/firestore";
import { getDateString, getTime } from "@/lib/date";

export async function GET(req: NextRequest, res: NextResponse) {
  revalidatePath("/api/newsletter");

  const newsApiUrl = new URL("/api/news", req.nextUrl.origin).toString();
  const aggregatedResponse = await axios.get(newsApiUrl, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  type SerializedProcessedNewsItem = Omit<ProcessedNewsItem, "pubDate"> & {
    pubDate: string;
  };

  type SerializedTopicNewsGroup = {
    topic: string;
    slug: string;
    publisher: string;
    sectionHints: NewsletterSectionHint[];
    items: SerializedProcessedNewsItem[];
  };

  const serializedTopics = (aggregatedResponse.data?.topics ??
    []) as SerializedTopicNewsGroup[];

  const commentaryGroups = serializedTopics
    .map((group) => {
      const items: ProcessedNewsItem[] = [];

      group.items.forEach((item) => {
        const pubDate = new Date(item.pubDate);
        if (Number.isNaN(pubDate.getTime())) {
          return;
        }

        items.push({
          ...item,
          pubDate,
          sectionHints: item.sectionHints ?? [],
        });
      });

      if (items.length === 0) {
        return null;
      }

      return {
        topic: group.topic,
        slug: group.slug,
        publisher: group.publisher,
        sectionHints: group.sectionHints ?? [],
        items,
      } as TopicNewsGroup;
    })
    .filter((group): group is TopicNewsGroup => !!group);

  const totalTopics = commentaryGroups.length;
  const totalArticles = commentaryGroups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  const totalPublishers = new Set(
    commentaryGroups.map((group) => group.publisher)
  ).size;

  // Generate unique ID for this email send
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const sendId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((byte) => chars[byte % 36])
    .join("");

  // Respond immediately to avoid cron timeout
  const response = NextResponse.json(
    {
      message: "Newsletter generation and sending started",
      sendId,
      summary: {
        totalArticles,
        totalTopics,
        totalPublishers,
      },
    },
    { status: 200 }
  );

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");

  // Process newsletter in background
  process.nextTick(async () => {
    let errorDetails = "";
    let recipientCount = 0;

    try {
      // Get active subscribers from Firestore
      const recipients = await getActiveSubscribers();
      recipientCount = recipients.length;

      if (recipients.length === 0) {
        console.log("No active subscribers found");
        await updateEmailSendStatus(
          sendId,
          "failed",
          undefined,
          "No active subscribers found",
          0,
          0
        );
        return;
      }

      console.log(
        `Starting newsletter send ${sendId} to ${recipients.length} subscribers`
      );

      // Create initial status record
      await createEmailSendStatus(sendId, recipients.length, {
        totalArticles,
        totalTopics,
        totalPublishers,
      });

      console.log(
        `Processing ${totalArticles} articles from ${totalTopics} topics and ${totalPublishers} publishers`
      );

      const formattedArticles: FormattedArticles = await formatArticles(
        commentaryGroups
      );

      console.log(`Articles formatted successfully for send ${sendId}`);

      // Validate environment variables
      if (!process.env.GOOGLE_USER_EMAIL || !process.env.GOOGLE_APP_PASSWORD) {
        throw new Error(
          "Missing email configuration: GOOGLE_USER_EMAIL or GOOGLE_APP_PASSWORD not set"
        );
      }

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.GOOGLE_USER_EMAIL,
          pass: process.env.GOOGLE_APP_PASSWORD,
        },
      });

      // Verify SMTP connection
      try {
        await transporter.verify();
        console.log(`SMTP connection verified for send ${sendId}`);
      } catch (verifyError) {
        throw new Error(
          `SMTP connection failed: ${
            verifyError instanceof Error ? verifyError.message : "Unknown error"
          }`
        );
      }

      const data = {
        from: `"ZK Daily Intelligence Brief" <${process.env.GOOGLE_USER_EMAIL}>`,
        to: process.env.GOOGLE_USER_EMAIL,
        bcc: recipients.join(", "),
        subject: `ZK Daily Intelligence Brief - ${getDateString()} | ID: ${sendId}`,
        text: formatRawBody(formattedArticles, sendId),
        html: formatBody(formattedArticles, sendId),
      };

      console.log(`Sending newsletter ${sendId} with subject: ${data.subject}`);

      let info = await transporter.sendMail(data);

      console.log(
        `Newsletter ${sendId} sent successfully to ${recipients.length} subscribers`
      );
      console.log(`Message ID: ${info.messageId}`);
      console.log(`Accepted: ${JSON.stringify(info.accepted)}`);
      console.log(`Rejected: ${JSON.stringify(info.rejected)}`);

      // Calculate successful/failed recipients
      const successfulCount = Array.isArray(info.accepted)
        ? info.accepted.length
        : recipients.length;
      const failedCount = Array.isArray(info.rejected)
        ? info.rejected.length
        : 0;

      // Prepare clean NodeMailer response (remove undefined fields)
      const cleanResponse: any = {};
      if (info.messageId) cleanResponse.messageId = info.messageId;
      if (info.accepted) cleanResponse.accepted = info.accepted;
      if (info.rejected) cleanResponse.rejected = info.rejected;
      if (info.pending) cleanResponse.pending = info.pending;
      if (info.response) cleanResponse.response = info.response;

      // Update status with success
      await updateEmailSendStatus(
        sendId,
        "success",
        cleanResponse,
        undefined,
        successfulCount,
        failedCount
      );
    } catch (error) {
      errorDetails =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`Error processing newsletter ${sendId}:`, error);

      if (error instanceof Error && error.stack) {
        console.error(`Stack trace for ${sendId}:`, error.stack);
      }

      // Update status with failure
      try {
        await updateEmailSendStatus(
          sendId,
          "failed",
          undefined,
          errorDetails,
          0,
          recipientCount
        );
      } catch (updateError) {
        console.error(
          `Failed to update status for failed send ${sendId}:`,
          updateError
        );
      }
    }
  });

  return response;
}
