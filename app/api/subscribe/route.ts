import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/firestore";
import { isValidEmail } from "@/lib/email";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

async function verifyRecaptcha(token?: string | null, remoteIp?: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);

  if (!secret) {
    // If no secret is configured, skip verification (safer to allow than fail)
    console.warn("RECAPTCHA_SECRET_KEY not configured; skipping verification");
    return { ok: true, score: 1 };
  }

  if (!token) {
    return { ok: false, score: 0, reason: "missing-token" };
  }

  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    if (remoteIp) params.append("remoteip", remoteIp);

    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      return { ok: false, score: 0, reason: "recaptcha-network-failure" };
    }

    const json = await res.json();
    // json: { success, score, action, challenge_ts, hostname, 'error-codes'? }
    if (!json.success) {
      return {
        ok: false,
        score: json.score ?? 0,
        reason: "recaptcha-failed",
        payload: json,
      };
    }

    if (typeof json.score === "number" && json.score < minScore) {
      return {
        ok: false,
        score: json.score,
        reason: "recaptcha-low-score",
        payload: json,
      };
    }

    return { ok: true, score: json.score ?? 1, payload: json };
  } catch (err) {
    console.warn("Error verifying reCAPTCHA:", err);
    return { ok: false, score: 0, reason: "recaptcha-exception" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    // Verify reCAPTCHA v3 token (if present)
    const recaptchaResult = await verifyRecaptcha(
      body.recaptchaToken,
      request.headers.get("x-forwarded-for") ?? undefined
    );
    if (!recaptchaResult.ok) {
      return NextResponse.json(
        {
          error: `reCAPTCHA verification failed: ${
            recaptchaResult.reason || "low-score"
          }`,
        },
        { status: 400 }
      );
    }

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
