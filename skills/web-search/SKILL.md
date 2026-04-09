---
name: web-search
description: Search the web and fetch content from URLs. Use for research, fact-checking, news, or any web lookup.
---

# Web Search & Fetch

## Search via DuckDuckGo (no API key needed)
```bash
# HTML lite search
curl -s "https://html.duckduckgo.com/html/?q=QUERY" | grep -oP '(?<=<a rel="nofollow" class="result__a" href=").*?(?=")'
```

## Fetch URL content
```bash
# Readable text extraction
curl -s URL | python3 -c "
import sys, html
from html.parser import HTMLParser
class T(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','nav','header','footer'): self.skip = True
    def handle_endtag(self, tag):
        if tag in ('script','style','nav','header','footer'): self.skip = False
    def handle_data(self, data):
        if not self.skip: self.text.append(data.strip())
t = T()
t.feed(sys.stdin.read())
print('\n'.join(filter(None, t.text))[:5000])
"
```

## Alternative: lynx (if installed)
```bash
lynx -dump -nolist URL | head -200
```

Always summarize findings rather than dumping raw output.
