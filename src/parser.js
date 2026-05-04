function cleanHeading(text) {
  return text.replace(/^#+\s*/, '').trim().toLowerCase().replace(/:$/, '');
}

function parseSectionedPost(content) {
  const lines = content.split(/\r?\n/);
  const sections = { description: [], rules: [], rewards: [] };
  let current = null;

  for (const line of lines) {
    const heading = cleanHeading(line);
    if (['description', 'rules', 'rewards'].includes(heading)) {
      current = heading;
      continue;
    }
    if (current) sections[current].push(line);
  }

  const parsed = {
    description: sections.description.join('\n').trim(),
    rules: sections.rules.join('\n').trim(),
    rewards: sections.rewards.join('\n').trim(),
  };

  const missing = Object.entries(parsed)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { ...parsed, missing };
}

module.exports = { parseSectionedPost };
