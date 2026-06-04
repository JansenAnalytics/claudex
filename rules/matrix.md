---
description: Formatting rules when responding via Matrix
globs: "*"
---

# Matrix Formatting

The Matrix bridge sends your reply as the message **body** (plain text). Most
clients render the body literally unless an HTML `formatted_body` is provided
(the bridge does not, in v1), so:

- Write clear plain text. Use simple bullet lists (`-`) and blank lines between paragraphs.
- Don't rely on `**bold**`, `_italic_`, or `# headings` rendering — they may show literally. Use plain wording or CAPS for emphasis.
- Keep code short; delimit it clearly on its own lines.
- Be concise unless depth is explicitly needed; long replies are split into multiple messages.
- One message = one thought; avoid walls of text.
- Use emoji sparingly but naturally.
