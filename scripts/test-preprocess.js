#!/usr/bin/env node
/**
 * Test script for the preprocessing pipeline
 *
 * Usage:
 *   node scripts/test-preprocess.js
 *
 * This script:
 * 1. Generates mock articles (simulating 100+ sources)
 * 2. Runs preprocessing
 * 3. Reports stats and savings
 */

const MOCK_PUBLISHERS = [
  "BBC",
  "CNN",
  "NPR",
  "The Guardian",
  "Al Jazeera",
  "Reuters",
  "AP",
  "Bloomberg",
  "WSJ",
  "NYT",
  "Washington Post",
  "The Atlantic",
  "Vox",
  "Politico",
  "The Hill",
];

const MOCK_TOPICS = [
  "Breaking News",
  "Politics",
  "World News",
  "Business",
  "Technology",
  "Science",
  "Health",
  "Climate",
  "Opinion",
  "Analysis",
];

const STORY_TEMPLATES = [
  "President announces new policy on {topic}",
  "Breaking: Major development in {topic} sector",
  "Analysis: What {topic} means for the future",
  "Opinion: The truth about {topic}",
  "Experts weigh in on {topic} controversy",
  "{topic}: What you need to know",
  "In-depth: Understanding the {topic} crisis",
  "Investigation: Behind the {topic} scandal",
];

function generateMockArticles(count = 120) {
  const articles = [];
  const now = new Date();

  // Generate some duplicate stories (different publishers, same story)
  const stories = [];
  for (let i = 0; i < count / 3; i++) {
    const template =
      STORY_TEMPLATES[Math.floor(Math.random() * STORY_TEMPLATES.length)];
    const randomTopic = [
      "climate change",
      "economy",
      "elections",
      "tech regulation",
    ][Math.floor(Math.random() * 4)];
    stories.push(template.replace("{topic}", randomTopic));
  }

  // Create articles with duplicates and variations
  for (let i = 0; i < count; i++) {
    const story = stories[Math.floor(Math.random() * stories.length)];
    const publisher =
      MOCK_PUBLISHERS[Math.floor(Math.random() * MOCK_PUBLISHERS.length)];
    const topic = MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)];

    // Add variation to some titles
    const variation = Math.random() > 0.5 ? ` - ${publisher}` : "";

    articles.push({
      title: story + variation,
      description: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${story}`,
      link: `https://${publisher
        .toLowerCase()
        .replace(/\s+/g, "")}.com/article-${i}?utm_source=test`,
      pubDate: new Date(now.getTime() - Math.floor(Math.random() * 86400000)),
      source: `${publisher} - ${topic}`,
      publisher,
      topic,
      slug: `${publisher.toLowerCase()}-${topic
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
      sectionHints: ["international", "politics"],
    });
  }

  return articles;
}

async function testPreprocessing() {
  console.log("🧪 Testing preprocessing pipeline\n");

  // Import preprocessing functions
  const { preprocessArticles } = await import("../lib/preprocess.ts");

  // Generate mock data
  console.log("📝 Generating mock articles...");
  const articles = generateMockArticles(120);
  console.log(`   Generated ${articles.length} articles\n`);

  // Run preprocessing
  console.log("⚙️  Running preprocessing pipeline...");
  const startTime = Date.now();

  const { representatives, stats } = preprocessArticles(articles, {
    similarityThreshold: 0.75,
    maxClusterSize: 10,
    preferredPublishers: new Set(["BBC", "CNN", "NPR", "The Guardian"]),
  });

  const processingTime = Date.now() - startTime;

  // Report results
  console.log("\n📊 Results:");
  console.log(`   Original articles:     ${stats.originalCount}`);
  console.log(`   After deduplication:   ${stats.afterDedupeCount}`);
  console.log(`   Clusters found:        ${stats.clusterCount}`);
  console.log(`   Representatives:       ${stats.representativeCount}`);
  console.log(`   Reduction:             ${stats.reductionPercent}%`);
  console.log(`   Processing time:       ${processingTime}ms`);

  // Calculate savings
  const tokenSavings = Math.round(
    (stats.originalCount - stats.representativeCount) * 150 // ~150 tokens per article
  );
  const latencySavings = Math.round(
    (stats.originalCount - stats.representativeCount) * 0.05 // ~50ms per article
  );

  console.log("\n💰 Estimated Savings:");
  console.log(
    `   Tokens saved:          ~${tokenSavings.toLocaleString()} tokens`
  );
  console.log(`   Latency saved:         ~${latencySavings}ms`);
  console.log(
    `   Cost saved:            ~$${((tokenSavings / 1000000) * 0.15).toFixed(
      4
    )} (at $0.15/1M tokens)`
  );

  console.log("\n✅ Test completed successfully!");
}

testPreprocessing().catch(console.error);
