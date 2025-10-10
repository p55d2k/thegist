import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/firestore";
import { isValidEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

// reCAPTCHA removed: no server-side verification is performed

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Rate limiting: identify client IP (x-forwarded-for or fallback)
    const xff = request.headers.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0].trim() : request.ip ?? "unknown";

    const rl = checkRateLimit(ip, { windowMs: 60_000, max: 6 });
    if (!rl.ok) {
      // Return 429 with minimal headers
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.ceil((rl.reset - Date.now()) / 1000)),
            "x-ratelimit-limit-requests": String(6),
            "x-ratelimit-remaining-requests": String(0),
            "x-ratelimit-reset": String(rl.reset),
          },
        }
      );
    }
    const { email, nickname } = body;

    // Honeypot check: reject if nickname has a value
    if (nickname && nickname.trim()) {
      console.log("Honeypot triggered for email:", email);
      return NextResponse.json(
        {
          message: "Successfully subscribed!",
          alreadyExists: false,
        },
        { status: 201 }
      );
    }

    // reCAPTCHA removed: skip verification entirely

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailIsValid = await isValidEmail(email);
    if (!emailIsValid) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Try to add subscriber
    const isNewSubscriber = await addSubscriber(email);

    if (!isNewSubscriber) {
      return NextResponse.json(
        {
          message: "Email already subscribed",
          alreadyExists: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: "Successfully subscribed!",
        alreadyExists: false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Subscription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
