import { NextResponse, type NextRequest } from "next/server";
import { addSubscriber } from "@/lib/firestore";
import { z } from "zod";

const emailSchema = z.object({
  email: z.email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = emailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const { email } = result.data;

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
