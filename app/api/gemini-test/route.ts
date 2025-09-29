import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing GEMINI_API_KEY environment variable",
      },
      { status: 500 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Test different model names to see which ones work
    const modelsToTest = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-pro",
    ];

    const results = [];

    for (const modelName of modelsToTest) {
      try {
        console.log(`Testing model: ${modelName}`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.6,
            topP: 0.8,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        });

        const testPrompt = `Return a simple JSON object with the following structure:
{
  "status": "success",
  "message": "Hello from ${modelName}",
  "timestamp": "${new Date().toISOString()}"
}`;

        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: testPrompt }],
            },
          ],
        });

        if (!result.response) {
          results.push({
            model: modelName,
            status: "error",
            error: "No response from API",
          });
          continue;
        }

        const rawText = result.response.text();
        console.log(`Raw response from ${modelName}:`, rawText);

        // Try to parse the JSON
        let parsed;
        try {
          parsed = JSON.parse(rawText);
          results.push({
            model: modelName,
            status: "success",
            rawResponse: rawText,
            parsedResponse: parsed,
          });
        } catch (parseError) {
          results.push({
            model: modelName,
            status: "json_parse_error",
            rawResponse: rawText,
            error:
              parseError instanceof Error
                ? parseError.message
                : "Unknown parse error",
          });
        }
      } catch (modelError) {
        console.error(`Error testing model ${modelName}:`, modelError);
        results.push({
          model: modelName,
          status: "model_error",
          error:
            modelError instanceof Error
              ? modelError.message
              : "Unknown model error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey.length,
      results,
    });
  } catch (error) {
    console.error("Gemini test failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
