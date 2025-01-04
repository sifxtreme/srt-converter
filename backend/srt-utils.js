// Parse SRT content
export function parseSRT(content) {
  const subtitles = [];
  // Split by double newlines but handle both \r\n and \n line endings
  const blocks = content.trim().split(/\r?\n\r?\n/);

  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const index = parseInt(lines[0]);
      const timestamp = lines[1];
      const text = lines.slice(2).join('\n');

      subtitles.push({ index, timestamp, text });
    }
  });

  return subtitles;
}

// Generate SRT content
export function generateSRT(subtitles) {
  return subtitles
    .map(sub => {
      return `${sub.index}\n${sub.timestamp}\n${sub.text}\n`;
    })
    .join('\n');
}