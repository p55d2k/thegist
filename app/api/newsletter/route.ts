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
import { recipients } from "@/constants/recipients";
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

  // Calculate basic summary before processing
  const totalTopics = commentaryGroups.length;
  const totalArticles = commentaryGroups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  const totalPublishers = new Set(
    commentaryGroups.map((group) => group.publisher)
  ).size;

  // Respond immediately to avoid cron timeout
  const response = NextResponse.json(
    {
      message: "Newsletter generation and sending started",
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
    try {
      const formattedArticles: FormattedArticles = await formatArticles(
        commentaryGroups
      );

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.GOOGLE_USER_EMAIL,
          pass: process.env.GOOGLE_APP_PASSWORD,
        },
      });

      const id = crypto
        .getRandomValues(new Uint32Array(1))[0]
        .toString(36)
        .padStart(8, "0")
        .slice(0, 8);

      const data = {
        from: `"ZK Daily Intelligence Brief" <${process.env.GOOGLE_USER_EMAIL}>`,
        to: process.env.GOOGLE_USER_EMAIL,
        bcc: recipients.join(", "),
        subject: `ZK Daily Intelligence Brief - ${getDateString()} | ID: ${id}`,
        text: formatRawBody(formattedArticles, id),
        html: formatBody(formattedArticles, id),
      };

      let info = await transporter.sendMail(data);
      console.log(`Newsletter sent: ${info.messageId}`);
    } catch (error) {
      console.error("Error processing newsletter:", error);
    }
  });

  return response;
}
