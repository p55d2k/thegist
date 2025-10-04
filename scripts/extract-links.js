const fs = require('fs');
const path = require('path');

// Read the links.ts file
const linksFile = path.join(__dirname, 'constants', 'links.ts');
const content = fs.readFileSync(linksFile, 'utf8');

// Extract URLs using regex - look for url: "..." patterns
const urlRegex = /url:\s*"([^"]+)"/g;
const urls = [];
let match;

while ((match = urlRegex.exec(content)) !== null) {
  urls.push(match[1]);
}

// Write to feeds.txt
const outputFile = path.join(__dirname, 'feeds.txt');
fs.writeFileSync(outputFile, urls.join('\n'), 'utf8');

console.log(`Extracted ${urls.length} URLs to feeds.txt`);