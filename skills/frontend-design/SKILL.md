---
description: "Based on Anthropic's Frontend Aesthetics research. Adapted for OpenClaw with practical tooling additions."
name: frontend-design
triggers:
  - build a page
  - create a dashboard
  - design a component
  - landing page
  - frontend
  - UI design
  - web interface
  - make it look good
  - redesign
  - polish the frontend
---

# Frontend Design Skill

Based on Anthropic's [Frontend Aesthetics research](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb). Adapted for OpenClaw with practical tooling additions.

## Core Principle

**You tend toward generic, "on distribution" output.** In frontend design, this creates "AI slop": white backgrounds, purple gradients, Inter font, predictable card layouts. Fight this instinct. Every frontend should feel like a human designer made deliberate, bold choices.

## Design Thinking (BEFORE writing any code)

Before coding, commit to a clear aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: Pick a BOLD direction — don't hedge:
   - Brutally minimal / Swiss design
   - Maximalist chaos / Memphis Group
   - Retro-futuristic / Cyberpunk
   - Organic / Natural / Earthy
   - Luxury / Refined / Editorial
   - Playful / Toy-like / Rounded
   - Industrial / Utilitarian / Terminal
   - Art Deco / Geometric
   - Soft / Pastel / Dreamy
   - Dark mode / Moody / Cinematic
   - Japanese / Scandinavian minimalism
   - Newspaper / Magazine editorial
   - Brutalist / Raw HTML energy
3. **Differentiation**: What's the ONE thing someone will remember about this?
4. **Constraints**: Framework (React/Vue/vanilla), performance, accessibility needs

**Write down your aesthetic direction before coding.** This prevents drift back to defaults.

## Typography

**NEVER use**: Inter, Roboto, Arial, system-ui, system fonts, or any default sans-serif.

**DO use**: Distinctive, characterful fonts from Google Fonts. Pair a display font with a body font:

| Display (headings) | Body (text) | Vibe |
|---|---|---|
| Syne | DM Sans | Modern tech |
| Playfair Display | Source Serif Pro | Editorial luxury |
| Archivo Black | Work Sans | Bold industrial |
| Fraunces | Outfit | Organic warmth |
| Instrument Serif | Instrument Sans | Refined minimal |
| Space Mono | Karla | Terminal/hacker |
| Unbounded | Figtree | Playful modern |
| Cormorant Garamond | Lato | Classic elegance |
| Bebas Neue | Barlow | Poster/display |
| JetBrains Mono | IBM Plex Sans | Developer tools |

**Vary your choices.** If you used Syne last time, pick something completely different. NEVER converge on the same font across projects.

## Color & Theme

- Commit to a **cohesive palette** — use CSS custom properties (`--primary`, `--accent`, etc.)
- **Dominant + accent** beats evenly distributed colors. One bold color with sharp accents.
- Draw from real-world inspiration: IDE themes (Dracula, Nord, Catppuccin, Tokyo Night), cultural aesthetics, film palettes
- Vary between light and dark themes across projects

**NEVER use**: Purple gradient on white, blue-to-purple gradients, generic tech-blue (#4F46E5 and friends).

### Inspiration Sources (from Anthropic's research — these work well)
- **IDE themes**: Dracula, Nord, Catppuccin, Tokyo Night, One Dark, Solarized, Monokai
- **Cultural aesthetics**: Japanese wabi-sabi, Scandinavian hygge, Bauhaus, Swiss design, Art Nouveau
- **Film/photography**: Wes Anderson palettes, film noir, Blade Runner neons, Terrence Malick naturals
- **Print design**: Magazine editorial, vintage book covers, Swiss typography posters

Pick ONE inspiration and let it infuse the whole design. Don't mix three aesthetics — commit.

### Example palettes (inspiration, don't copy verbatim):

```css
/* Warm industrial */
--bg: #1C1917; --surface: #292524; --primary: #F97316; --accent: #FCD34D; --text: #F5F5F4;

/* Cool editorial */
--bg: #FAFAF9; --surface: #FFFFFF; --primary: #0F172A; --accent: #DC2626; --text: #1E293B;

/* Nature/organic */
--bg: #ECFDF5; --surface: #FFFFFF; --primary: #065F46; --accent: #D97706; --text: #1F2937;

/* Neon dark */
--bg: #0A0A0B; --surface: #18181B; --primary: #22D3EE; --accent: #F472B6; --text: #E4E4E7;

/* Vintage paper */
--bg: #FEF3C7; --surface: #FFFBEB; --primary: #92400E; --accent: #B91C1C; --text: #451A03;
```

## Motion & Animation

Focus on **high-impact moments** over scattered micro-interactions:

1. **Page load**: Staggered reveals with `animation-delay` — elements fade/slide in sequentially
2. **Scroll triggers**: Elements animate when entering viewport (IntersectionObserver or CSS `animation-timeline`)
3. **Hover states**: Subtle but surprising — scale, color shift, shadow elevation, underline animations
4. **Transitions**: Smooth state changes on interactive elements (300ms ease-out)

**Implementation**:
- HTML/CSS: Pure CSS animations (keyframes + animation-delay for stagger)
- React: Use [Motion](https://motion.dev/) (formerly Framer Motion) when available
- Scroll: IntersectionObserver with `.visible` class toggle

```css
/* Staggered reveal pattern */
.reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s ease-out; }
.reveal.visible { opacity: 1; transform: translateY(0); }
.reveal:nth-child(1) { transition-delay: 0s; }
.reveal:nth-child(2) { transition-delay: 0.1s; }
.reveal:nth-child(3) { transition-delay: 0.2s; }
```

## Backgrounds & Atmosphere

**NEVER default to solid white or solid dark.** Create depth:

- Gradient meshes (`background: radial-gradient(at 20% 50%, color1, transparent), ...`)
- Noise/grain overlays (SVG filter or CSS `background-image` with noise)
- Geometric patterns (CSS-generated or SVG)
- Layered transparencies
- Subtle texture (paper, fabric, concrete)
- Dramatic shadows for depth hierarchy

```css
/* Noise overlay */
.grain::after {
  content: ''; position: fixed; inset: 0; z-index: 9999; pointer-events: none;
  background-image: url("data:image/svg+xml,..."); /* inline SVG noise */
  opacity: 0.03;
}

/* Mesh gradient */
.mesh-bg {
  background:
    radial-gradient(at 40% 20%, hsla(28, 100%, 74%, 0.3) 0, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.2) 0, transparent 50%),
    radial-gradient(at 0% 50%, hsla(355, 85%, 63%, 0.15) 0, transparent 50%),
    var(--bg);
}
```

## Spatial Composition

Break the grid. Not everything needs to be a card in a 3-column layout.

- **Asymmetry**: Offset elements, varied column widths
- **Overlap**: Elements that break their containers
- **Generous negative space** OR **controlled density** — commit to one
- **Diagonal flow**: Rotated elements, angled section dividers
- **Full-bleed sections** alternating with contained content
- **Bento grid**: Varied card sizes in a grid (not uniform)

## Proven Patterns (from Anthropic's cookbook examples)

These patterns consistently produce better results:

- **Hero with perspective mockup**: Show a fake app screenshot with `transform: perspective(1000px) rotateY(-5deg)` that flattens on hover
- **Staggered fade-in on load**: Elements use `.fade-in` with incrementing `animation-delay` (0.1s, 0.2s, 0.3s...)
- **Gradient text**: `background: linear-gradient(...); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`
- **CTA buttons with ripple**: `::before` pseudo-element that expands from center on hover
- **Feature cards with top-border reveal**: Hidden gradient border-top that `scaleX(0→1)` on hover
- **Floating background blobs**: `radial-gradient` circles with slow `animation: float 20s ease-in-out infinite`
- **Section contrast**: Alternate between light and dark sections to create rhythm
- **Glassmorphism nav on scroll**: `backdrop-filter: blur(10px)` with scroll-triggered class toggle

## Practical Checklist (before submitting frontend code)

1. ☐ Is the font distinctive? (Not Inter/Roboto/Arial)
2. ☐ Is the color palette cohesive and non-generic?
3. ☐ Does the background have depth? (Not solid white/dark)
4. ☐ Is there at least one animation/transition?
5. ☐ Does the layout have visual interest? (Not just stacked cards)
6. ☐ Are there hover states on interactive elements?
7. ☐ CSS variables for theming consistency?
8. ☐ Is it responsive? (Mobile-first or at least tested)
9. ☐ Would you remember this design tomorrow? If not, make a bolder choice.

## Previewing Results

After generating frontend code, preview it:

```bash
# Quick preview — write HTML to file and screenshot
echo '<html>...</html>' > /tmp/preview.html

# Use the website-screenshot skill for headless capture:
# node ~/openclaw/skills/website-screenshot/scripts/screenshot.cjs file:///tmp/preview.html

# Or serve locally for React/Vue apps:
npx vite preview --host 0.0.0.0 --port 5173
```

## Match Complexity to Vision

- **Maximalist design** → elaborate code: layered backgrounds, multiple animations, complex grid, decorative elements
- **Minimalist design** → restrained code: perfect spacing, precise typography, subtle transitions, every pixel intentional

Elegance = executing the vision well. A minimal design with sloppy spacing is worse than a maximalist design that's consistent.

## Remember

You are capable of extraordinary creative work. Don't default to safe. Don't hold back. Show what happens when you fully commit to a distinctive vision.
