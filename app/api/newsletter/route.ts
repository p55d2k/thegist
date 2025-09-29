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
    items: SerializedProcessedNewsItem[];
  };

  const serializedTopics = (aggregatedResponse.data?.topics ??
    []) as SerializedTopicNewsGroup[];

  const seenLinks = new Set<string>();

  const commentaryGroups = serializedTopics
    .map((group) => {
      const items: ProcessedNewsItem[] = [];

      group.items.forEach((item) => {
        if (seenLinks.has(item.link)) {
          return;
        }

        seenLinks.add(item.link);

        const pubDate = new Date(item.pubDate);
        if (Number.isNaN(pubDate.getTime())) {
          return;
        }

        items.push({
          ...item,
          pubDate,
        });
      });

      if (items.length === 0) {
        return null;
      }

      return {
        topic: group.topic,
        slug: group.slug,
        publisher: group.publisher,
        items,
      } as TopicNewsGroup;
    })
    .filter((group): group is TopicNewsGroup => !!group);

  const formattedArticles: FormattedArticles = formatArticles(commentaryGroups);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GOOGLE_USER_EMAIL,
      pass: process.env.GOOGLE_APP_PASSWORD,
    },
  });

  const id = Math.random().toString(36).substring(7);

  const data = {
    from: `"ZK's ${getTime()} Commentary Newsletter" <${
      process.env.GOOGLE_USER_EMAIL
    }>`,
    to: process.env.GOOGLE_USER_EMAIL,
    bcc: recipients.join(", "),
    subject: `Commentary Newsletter - ${getDateString()} | ID: ${id}`,
    text: formatRawBody(formattedArticles, id),
    html: formatBody(formattedArticles, id),
  };
  let info = await transporter.sendMail(data);

  const response = NextResponse.json(
    {
      message: `Message sent: ${info.messageId}`,
      ...data,
      summary: {
        totalArticles: formattedArticles.totalArticles,
        totalTopics: formattedArticles.totalTopics,
        totalPublishers: formattedArticles.totalPublishers,
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

  return response;
}
