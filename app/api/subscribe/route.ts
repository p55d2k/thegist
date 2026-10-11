import { NextResponse, type NextRequest } from "next/server";
import { addSubscriber } from "@/lib/firestore";
import { isValidEmail } from "@/lib/email-validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const emailSchema = z.object({
  email: z.email("Invalid email address"),
  nickname: z.string().optional(),
});

const getClientIp = (request: NextRequest): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
};

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const result = emailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const { email, nickname } = result.data;

    // Honeypot: silently accept submissions from bots that fill the hidden
    // nickname field so they never learn the trap works.
    if (nickname) {
      return NextResponse.json(
        {
          success: true,
          message: "Successfully subscribed!",
          alreadyExists: false,
        },
        { status: 201 }
      );
    }

    // Rate limit per client IP to prevent subscription spam.
    const rateLimit = checkRateLimit(`subscribe:${getClientIp(request)}`);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Server-side validation (regex + external checks). Rejects disposable
    // addresses and malformed emails that pass the client-side regex.
    const valid = await isValidEmail(email);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const isNewSubscriber = await addSubscriber(email);

    if (isNewSubscriber) {
      return NextResponse.json(
        {
          success: true,
          message: "Successfully subscribed!",
          alreadyExists: false,
        },
        { status: 201 }
      );
    } else {
      return NextResponse.json(
        {
          success: true,
          message: "You're already subscribed!",
          alreadyExists: true,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Subscription error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}