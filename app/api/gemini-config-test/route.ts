import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { configTest = "default" } = await request.json();

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

    // Test different configurations
    const configs = {
      // Original config from gemini.ts
      default: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.6,
          topP: 0.8,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      },
      // No MIME type
      noMimeType: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.6,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      },
      // Test if maxOutputTokens is the issue
      noMimeHighTokens: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.6,
          topP: 0.8,
          maxOutputTokens: 131072,
        },
      },
      // Test with lower tokens
      noMimeLowTokens: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.6,
          topP: 0.8,
          maxOutputTokens: 512,
        },
      },
      // Simpler config
      simple: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      },
      // Even simpler
      minimal: {
        model: "gemini-2.5-flash",
      },
      // Test complex prompt with no MIME type
      complexNoMime: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.6,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      },
      // Lower temperature
      conservative: {
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      },
    };

    const config =
      configs[configTest as keyof typeof configs] || configs.default;
    const model = genAI.getGenerativeModel(config);

    // Simple test data
    const testData = [
      {
        title: "Test Article 1",
        description: "This is a test article about politics",
        link: "https://example.com/1",
        publisher: "Test Publisher",
        topic: "Politics",
        slug: "test-1",
        source: "test",
        pubDate: new Date().toISOString(),
        sectionHints: ["politics"],
      },
      {
        title: "Test Article 2",
        description: "This is a test article about business",
        link: "https://example.com/2",
        publisher: "Test Publisher",
        topic: "Business",
        slug: "test-2",
        source: "test",
        pubDate: new Date().toISOString(),
        sectionHints: ["business-tech"],
      },
    ];

    // Different prompt styles to test
    const prompts = {
      complex: `You are an editorial assistant for a daily newsletter. Organise the provided articles into the following sections:

- essentialReads: overview + 3-4 highlight items
- commentaries: top 5-7 opinion/analysis pieces
- international: top 2-3 global headlines
- politics: top 2-3 policy/governance stories
- businessAndTech: top 2-3 market, business, or technology updates
- wildCard: exactly 1 unexpected or contrarian piece
- summary: closing paragraph summarising the mix

Guidelines:
- Use only the articles provided in the dataset.
- Prefer newer pieces (higher pubDate) when in doubt.
- Do not repeat the same article across multiple sections except essential highlights.
- Provide concise summaries (max 2 sentences).
- Preserve publisher/topic context to help the reader understand the angle.
- Return valid JSON only.
- Honour provided sectionHints when selecting items where possible.

Dataset:
${JSON.stringify(testData, null, 2)}`,

      simple: `Create a JSON newsletter plan from these articles: ${JSON.stringify(
        testData
      )}

Include these sections:
- essentialReads: {overview: string, highlights: array}
- commentaries: array  
- politics: array
- businessAndTech: array
- international: array
- wildCard: array
- summary: string

Return only valid JSON.`,

      basic: `Given these articles: ${JSON.stringify(testData)}

Return a JSON object with article categories. Use this format:
{
  "politics": [],
  "business": [],
  "summary": "Brief summary"
}`,

      minimal:
        'Return a simple JSON object: {"status": "success", "message": "Hello"}',
    };

    const promptKey =
      configTest === "minimal"
        ? "minimal"
        : configTest === "basic"
        ? "basic"
        : configTest === "simple"
        ? "simple"
        : configTest === "complexNoMime"
        ? "complex"
        : configTest.includes("noMime")
        ? "complex" // Test complex prompt with different token settings
        : "complex";

    const prompt = prompts[promptKey as keyof typeof prompts];

    console.log(`Testing config: ${configTest}`);
    console.log(`Prompt: ${prompt.substring(0, 200)}...`);
    console.log(`Config:`, JSON.stringify(config, null, 2));

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    if (!result.response) {
      return NextResponse.json(
        {
          error: "No response from Gemini API",
          configTest,
          config,
          promptLength: prompt.length,
        },
        { status: 500 }
      );
    }

    const rawText = result.response.text();
    console.log(
      `Config ${configTest} - Raw response length: ${rawText.length}`
    );
    console.log(
      `Config ${configTest} - Raw response: ${rawText.substring(0, 300)}`
    );

    return NextResponse.json({
      success: true,
      configTest,
      config,
      promptLength: prompt.length,
      responseLength: rawText.length,
      rawResponse: rawText,
      isEmpty: rawText.trim().length === 0,
      hasResponse: !!result.response,
    });
  } catch (error) {
    console.error(`Config test ${configTest} failed:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        configTest,
      },
      { status: 500 }
    );
  }
}
