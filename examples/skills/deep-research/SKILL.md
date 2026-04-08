---
name: deep-research
description: Conduct thorough multi-source research on any topic. Use when the user needs in-depth analysis, comparison, or investigation of a subject.
---

# Deep Research Skill

When given a research task:

1. **Decompose the question** into 3-5 sub-questions
2. **Search multiple sources** for each sub-question using Bash + curl
3. **Cross-reference findings** across sources
4. **Synthesize** into a structured report with:
   - Executive summary (3-5 sentences)
   - Key findings (bullet points)
   - Detailed analysis (organized by sub-topic)
   - Sources cited
   - Confidence level and caveats

## Search Methods
```bash
# DuckDuckGo (no API key needed)
curl -s "https://html.duckduckgo.com/html/?q=QUERY" | grep -oP '(?<=<a rel="nofollow" class="result__a" href=").*?(?=")'

# Fetch readable content from URL
curl -sL URL | sed 's/<[^>]*>//g' | head -200

# Wikipedia API
curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/TOPIC"
```

## Quality Standards
- Never present a single source as definitive
- Flag conflicting information explicitly
- Distinguish facts from opinions
- Include dates/recency of information
- Rate overall confidence: HIGH / MEDIUM / LOW
