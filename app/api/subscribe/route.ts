import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/firestore";
import { EMAIL_REGEX } from "@/constants/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!EMAIL_REGEX.test(email)) {
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
