import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const stripHtml = (value: string): string =>
  value.replace(/<[^>]*>/g, "").trim();

const truncate = (value: string, length = 220): string =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

export async function POST(request: Request) {
  const { testSize = "small" } = await request.json();

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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.6,
        topP: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    // Create mock articles with different sizes
    const createMockArticles = (count: number) => {
      const articles = [];
      for (let i = 0; i < count; i++) {
        articles.push({
          title: `Test Article ${i + 1}: Important News Story`,
          description: truncate(
            stripHtml(
              `This is a test description for article ${
                i + 1
              }. It contains some important information about current events and provides analysis on the topic. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`
            ),
            300
          ),
          link: `https://example.com/article-${i + 1}`,
          publisher: i % 3 === 0 ? "Reuters" : i % 3 === 1 ? "BBC" : "CNN",
          topic:
            i % 4 === 0
              ? "Politics"
              : i % 4 === 1
              ? "Business"
              : i % 4 === 2
              ? "International"
              : "Commentary",
          slug: `test-article-${i + 1}`,
          source: "test-feed",
          pubDate: new Date(Date.now() - i * 3600000).toISOString(),
          sectionHints:
            i % 5 === 0
              ? ["commentaries"]
              : i % 5 === 1
              ? ["international"]
              : i % 5 === 2
              ? ["politics"]
              : i % 5 === 3
              ? ["business-tech"]
              : ["wildcard"],
        });
      }
      return articles;
    };

    const testSizes = {
      tiny: 5,
      small: 10,
      medium: 25,
      large: 43, // The actual size from your logs
      huge: 60, // The MAX_INPUT_ARTICLES limit
    };

    const articleCount =
      testSizes[testSize as keyof typeof testSizes] || testSizes.small;
    const dataset = createMockArticles(articleCount);

    const instructions = `You are an editorial assistant for a daily newsletter. Organise the provided articles into the following sections:

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
- Honour provided sectionHints when selecting items where possible.`;

    const prompt = `${instructions}\n\nDataset:\n${JSON.stringify(
      dataset,
      null,
      2
    )}`;

    console.log(`Testing with ${articleCount} articles`);
    console.log(`Prompt length: ${prompt.length} characters`);
    console.log(`Dataset size: ${JSON.stringify(dataset).length} characters`);

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
          testSize,
          articleCount,
          promptLength: prompt.length,
        },
        { status: 500 }
      );
    }

    const rawText = result.response.text();
    console.log(`Raw response length: ${rawText.length}`);
    console.log(`Raw response preview: ${rawText.substring(0, 200)}`);

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Empty response from Gemini",
          testSize,
          articleCount,
          promptLength: prompt.length,
          datasetSize: JSON.stringify(dataset).length,
        },
        { status: 500 }
      );
    }

    // Try to parse the JSON
    let parsed;
    try {
      // Clean up the response like in the original code
      let jsonText = rawText.trim();

      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const jsonStart = jsonText.indexOf("{");
      const jsonEnd = jsonText.lastIndexOf("}");

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
      }

      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      return NextResponse.json(
        {
          error: "JSON parsing failed",
          parseError:
            parseError instanceof Error
              ? parseError.message
              : "Unknown parse error",
          rawResponse: rawText.substring(0, 1000),
          testSize,
          articleCount,
          promptLength: prompt.length,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      testSize,
      articleCount,
      promptLength: prompt.length,
      datasetSize: JSON.stringify(dataset).length,
      responseLength: rawText.length,
      rawResponse:
        rawText.substring(0, 500) + (rawText.length > 500 ? "..." : ""),
      parsedResponse: parsed,
      hasRequiredSections: !!(
        parsed.essentialReads &&
        parsed.commentaries &&
        parsed.international &&
        parsed.politics &&
        parsed.businessAndTech &&
        parsed.wildCard &&
        parsed.summary
      ),
    });
  } catch (error) {
    console.error("Gemini debug test failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        testSize,
      },
      { status: 500 }
    );
  }
}
