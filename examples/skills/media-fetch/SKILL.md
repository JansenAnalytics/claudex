---
name: media-fetch
user-invocable: false
description: Download video/audio from 1000+ sites (YouTube, Twitter/X, Spotify, TikTok, etc.), extract audio, download subtitles, transcribe speech to text, and search for videos. Use when asked to download, summarize, or transcribe any video/audio URL, or when asked to search YouTube.
triggers:
  - download video
  - download audio
  - youtube
  - transcribe video
  - summarize this video
  - get subtitles
  - yt-dlp
  - media download
  - podcast
  - search youtube
  - watch this
---

# Media Fetch

Download, extract, and transcribe media from 1000+ sites. Built on yt-dlp + ffmpeg + Whisper.

**Scripts:** `~/openclaw/skills/media-fetch/scripts/`
**Downloads:** `~/.media-fetch/downloads/`
**Transcripts:** `~/.media-fetch/transcripts/`
**Metadata:** `~/.media-fetch/metadata/`

## Quick Reference

```bash
S=~/openclaw/skills/media-fetch/scripts

# Download video (best quality)
python3 $S/fetch.py URL

# Audio only (MP3)
python3 $S/fetch.py URL --audio

# Download + transcribe (the "summarize this video" workflow)
python3 $S/fetch.py URL --transcript

# Subtitles only (fastest — no download needed)
python3 $S/fetch.py URL --subs

# Video info (no download)
python3 $S/fetch.py URL --info

# Search YouTube
python3 $S/fetch.py --search "prop trading strategies"

# Extract audio from local file
python3 $S/batch.py --file video.mp4 --extract-audio

# Transcribe local audio/video
python3 $S/batch.py --file audio.mp3 --transcribe
```

---

## Commands — fetch.py

### Video Info (No Download)
```bash
python3 fetch.py URL --info
python3 fetch.py URL --info --json    # Machine-readable
```

Shows: title, channel, duration, views, likes, description, chapters, available formats, subtitle languages, best video/audio quality.

### Download Video
```bash
python3 fetch.py URL                       # Best quality MP4
python3 fetch.py URL --quality 720         # Max 720p
python3 fetch.py URL --quality 480         # Max 480p
python3 fetch.py URL -o /tmp/videos        # Custom output dir
python3 fetch.py URL --format "bestvideo[height<=1080]+bestaudio"  # Custom format
```

### Download Audio Only
```bash
python3 fetch.py URL --audio               # MP3, best quality
python3 fetch.py URL --audio --clip 5:00-10:00   # Extract clip
```

### Download Subtitles Only
The fastest way to get video content — no media download needed:
```bash
python3 fetch.py URL --subs                    # English subtitles
python3 fetch.py URL --subs --sub-lang en,no   # English + Norwegian
python3 fetch.py URL --subs --sub-lang auto    # Auto-generated captions
```

Returns cleaned text (timestamps/formatting stripped). Works with:
- YouTube (manual + auto-generated captions)
- Most major platforms with subtitle support

### Download + Transcribe
The full "summarize this video" pipeline:
```bash
python3 fetch.py URL --transcript              # Auto: tries subs → Whisper API → local
python3 fetch.py URL --transcript --transcribe-method whisper-api
python3 fetch.py URL --transcript --transcribe-method subtitles
python3 fetch.py URL --transcript --language no    # Norwegian audio
```

Transcription methods (in `--transcribe-method`):
| Method | Speed | Cost | Quality | Requirements |
|--------|-------|------|---------|-------------|
| `subtitles` | ⚡ Instant | Free | Good (if available) | Video must have subs/captions |
| `whisper-api` | 🏃 Fast | ~$0.006/min | Excellent | `OPENAI_API_KEY` env var |
| `whisper-local` | 🐌 Slow | Free | Good | `pip install openai-whisper` + GPU recommended |
| `auto` | Varies | Varies | Best available | Tries subs → API → local |

### Search
```bash
python3 fetch.py --search "forex trading NFP strategy"
python3 fetch.py --search "react server components tutorial"
python3 fetch.py --search "prop firm funded account" --json
```

### Clip Extraction
Download only a portion of a video:
```bash
python3 fetch.py URL --clip 1:30-5:00          # Minutes:seconds
python3 fetch.py URL --clip 0:00-0:30 --audio  # First 30s audio
```

### Playlist Download
```bash
python3 fetch.py URL --playlist                    # Full playlist
python3 fetch.py URL --playlist --max-playlist 5   # First 5 items
python3 fetch.py URL --playlist --audio            # Audio from all
```

---

## Commands — batch.py

### Process URL List
Create a text file with one URL per line:
```
# urls.txt
https://youtube.com/watch?v=abc
https://youtube.com/watch?v=def
# Comments and blank lines are ignored
https://vimeo.com/123456
```

```bash
python3 batch.py urls.txt                        # Download all
python3 batch.py urls.txt --audio                # Audio only
python3 batch.py urls.txt --transcript           # Download + transcribe all
python3 batch.py urls.txt -o /tmp/batch-output   # Custom output dir
```

### Process Local Files
```bash
python3 batch.py --file video.mp4 --extract-audio           # → video.mp3
python3 batch.py --file audio.mp3 --transcribe               # → transcript text
python3 batch.py --file audio.mp3 --transcribe --language no # Norwegian
python3 batch.py --file video.mp4 --file-info                # ffprobe metadata
```

---

## Supported Sites

yt-dlp supports **1000+ sites** including:

| Category | Sites |
|----------|-------|
| Video | YouTube, Vimeo, Dailymotion, Twitch, Rumble, Odysee |
| Social | Twitter/X, TikTok, Instagram, Reddit, Facebook |
| Music | SoundCloud, Bandcamp, Mixcloud |
| Podcasts | Spotify (some), Apple Podcasts (some), RSS feeds |
| News | BBC, CNN, Reuters, Bloomberg |
| Education | Coursera, Udemy, Khan Academy |
| Live | Twitch live, YouTube live |
| Other | PeerTube, BitChute, Archive.org, and 1000+ more |

Full list: `yt-dlp --list-extractors`

---

## Agent Workflows

### "Summarize this YouTube video"
```bash
# Step 1: Get subtitles (fastest path)
python3 fetch.py URL --subs

# Step 2: If subs available, summarize the text directly
# If not, download audio and transcribe:
python3 fetch.py URL --transcript

# Step 3: Read the transcript and summarize
cat ~/.media-fetch/transcripts/TITLE.txt
```

### "Find and summarize a video about X"
```bash
# Step 1: Search
python3 fetch.py --search "topic query"

# Step 2: Pick best result, get transcript
python3 fetch.py CHOSEN_URL --transcript
```

### "Download this podcast episode"
```bash
python3 fetch.py PODCAST_URL --audio
```

### "Get the audio from this meeting recording"
```bash
python3 batch.py --file recording.mp4 --extract-audio
python3 batch.py --file recording.mp3 --transcribe
```

### "Download all videos from this playlist"
```bash
python3 fetch.py PLAYLIST_URL --playlist --audio --max-playlist 20
```

---

## Authentication / Cookies

Some sites require login. Export browser cookies:
```bash
# Option 1: Use browser cookies directly
python3 fetch.py URL --extra --cookies-from-browser chrome

# Option 2: Export cookies file (Netscape format)
python3 fetch.py URL --cookies ~/cookies.txt
```

---

## Dependencies

**Installed:**
- `yt-dlp` (2026.03.03) — media downloader
- `ffmpeg` (6.1.1) — audio/video processing
- `openai` SDK — Whisper API transcription

**Optional (not installed):**
- `openai-whisper` — local transcription: `pip3 install --break-system-packages openai-whisper`
  (Requires ~1GB disk + CUDA GPU for reasonable speed)

---

## Storage

| Directory | Contents | Cleanup |
|-----------|----------|---------|
| `~/.media-fetch/downloads/` | Downloaded video/audio files | Delete manually |
| `~/.media-fetch/transcripts/` | Text transcriptions + SRT files | Keep for reference |
| `~/.media-fetch/metadata/` | JSON metadata from --info | Auto-cleaned |

To clean old downloads:
```bash
find ~/.media-fetch/downloads -mtime +7 -delete    # Older than 7 days
```
