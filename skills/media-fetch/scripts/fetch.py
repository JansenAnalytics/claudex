#!/usr/bin/env python3
"""
Media Fetch — Download, extract, and process media from 1000+ sites.

Core engine wrapping yt-dlp with intelligent defaults, format selection,
audio extraction, subtitle download, metadata extraction, and transcription.

Usage:
  python3 fetch.py <url> [options]
  python3 fetch.py <url> --audio              # Audio only (MP3)
  python3 fetch.py <url> --transcript          # Download + transcribe
  python3 fetch.py <url> --subs               # Download subtitles only
  python3 fetch.py <url> --info               # Metadata only (no download)
  python3 fetch.py <url> --best               # Best quality video+audio
  python3 fetch.py <url> --playlist           # Download full playlist
"""

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== CONFIG ====================

DEFAULT_OUTPUT_DIR = Path.home() / ".media-fetch" / "downloads"
TRANSCRIPT_DIR = Path.home() / ".media-fetch" / "transcripts"
METADATA_DIR = Path.home() / ".media-fetch" / "metadata"

for d in [DEFAULT_OUTPUT_DIR, TRANSCRIPT_DIR, METADATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# yt-dlp output template
OUTPUT_TEMPLATE = "%(title).80s [%(id)s].%(ext)s"

# ==================== HELPERS ====================

def human_size(size_bytes):
    if not size_bytes: return "?"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def human_duration(seconds):
    if not seconds: return "?"
    return str(timedelta(seconds=int(seconds)))


def sanitize_filename(name):
    return re.sub(r'[<>:"/\\|?*]', '_', name)[:100]


def find_yt_dlp():
    """Find yt-dlp binary."""
    for path in [
        os.path.expanduser("~/.local/bin/yt-dlp"),
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
    ]:
        if os.path.exists(path):
            return path
    # Try PATH
    import shutil
    return shutil.which("yt-dlp") or "yt-dlp"


YT_DLP = find_yt_dlp()

# ==================== CORE FUNCTIONS ====================

def get_info(url: str, playlist: bool = False) -> dict:
    """Extract metadata without downloading."""
    cmd = [
        YT_DLP,
        "--dump-json",
        "--no-download",
        "--no-warnings",
    ]
    if not playlist:
        cmd.append("--no-playlist")
    cmd.append(url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            logger.error(f"yt-dlp error: {result.stderr[:500]}")
            return {"error": result.stderr[:500]}

        # Could be multiple JSON objects for playlists
        lines = result.stdout.strip().split('\n')
        entries = []
        for line in lines:
            if line.strip():
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

        if len(entries) == 1:
            info = entries[0]
        elif len(entries) > 1:
            info = {
                "type": "playlist",
                "entries": entries,
                "count": len(entries),
            }
        else:
            return {"error": "No info extracted"}

        return info

    except subprocess.TimeoutExpired:
        return {"error": "Timeout fetching info"}
    except Exception as e:
        return {"error": str(e)}


def format_info(info: dict) -> str:
    """Format metadata for display."""
    if info.get("error"):
        return f"❌ Error: {info['error']}"

    if info.get("type") == "playlist":
        lines = [f"📋 Playlist: {info.get('count', 0)} entries"]
        for i, entry in enumerate(info.get("entries", [])[:20]):
            dur = human_duration(entry.get("duration"))
            lines.append(f"  {i+1:3d}. [{dur}] {entry.get('title', '?')}")
        if info.get("count", 0) > 20:
            lines.append(f"  ... and {info['count'] - 20} more")
        return "\n".join(lines)

    lines = []
    lines.append(f"🎬 {info.get('title', '?')}")
    lines.append(f"   Channel:    {info.get('channel', info.get('uploader', '?'))}")
    lines.append(f"   Duration:   {human_duration(info.get('duration'))}")
    lines.append(f"   Uploaded:   {info.get('upload_date', '?')}")
    lines.append(f"   Views:      {info.get('view_count', '?'):,}" if isinstance(info.get('view_count'), int) else f"   Views:      {info.get('view_count', '?')}")

    if info.get('like_count'):
        lines.append(f"   Likes:      {info['like_count']:,}")

    lines.append(f"   URL:        {info.get('webpage_url', info.get('original_url', '?'))}")

    # Description (truncated)
    desc = info.get('description', '')
    if desc:
        desc_lines = desc.split('\n')[:5]
        truncated = '\n'.join(desc_lines)
        if len(desc_lines) < len(desc.split('\n')):
            truncated += '\n...'
        lines.append(f"\n   Description:\n   {truncated}")

    # Available formats summary
    formats = info.get('formats', [])
    if formats:
        video_fmts = [f for f in formats if f.get('vcodec', 'none') != 'none']
        audio_fmts = [f for f in formats if f.get('acodec', 'none') != 'none' and f.get('vcodec', 'none') == 'none']
        best_video = max(video_fmts, key=lambda f: f.get('height', 0) or 0, default=None)
        best_audio = max(audio_fmts, key=lambda f: f.get('abr', 0) or 0, default=None)

        if best_video:
            lines.append(f"   Best video: {best_video.get('height', '?')}p {best_video.get('vcodec', '?')}")
        if best_audio:
            lines.append(f"   Best audio: {best_audio.get('abr', '?')}kbps {best_audio.get('acodec', '?')}")

    # Subtitles
    subs = info.get('subtitles', {})
    auto_subs = info.get('automatic_captions', {})
    if subs:
        lines.append(f"   Subtitles:  {', '.join(sorted(subs.keys())[:10])}")
    if auto_subs:
        lines.append(f"   Auto-subs:  {', '.join(sorted(auto_subs.keys())[:10])}")

    # Chapters
    chapters = info.get('chapters', [])
    if chapters:
        lines.append(f"\n   Chapters ({len(chapters)}):")
        for ch in chapters[:15]:
            start = human_duration(ch.get('start_time', 0))
            lines.append(f"     [{start}] {ch.get('title', '?')}")
        if len(chapters) > 15:
            lines.append(f"     ... and {len(chapters) - 15} more")

    return "\n".join(lines)


def download(url: str, output_dir: str = None, audio_only: bool = False,
             format_spec: str = None, quality: str = "best",
             subs: bool = False, sub_lang: str = "en",
             playlist: bool = False, max_playlist: int = None,
             filename: str = None, quiet: bool = False,
             cookies: str = None, extra_args: list = None) -> dict:
    """
    Download media from URL.

    Returns dict with: filepath, title, duration, filesize, format, etc.
    """
    out_dir = Path(output_dir) if output_dir else DEFAULT_OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    template = filename if filename else OUTPUT_TEMPLATE
    output_path = str(out_dir / template)

    cmd = [YT_DLP]

    # Format selection
    if audio_only:
        cmd.extend([
            "-x",                          # Extract audio
            "--audio-format", "mp3",       # Convert to MP3
            "--audio-quality", "0",        # Best quality
        ])
    elif format_spec:
        cmd.extend(["-f", format_spec])
    elif quality == "best":
        cmd.extend(["-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"])
    elif quality == "720":
        cmd.extend(["-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best"])
    elif quality == "480":
        cmd.extend(["-f", "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best"])
    elif quality == "audio":
        cmd.extend(["-x", "--audio-format", "mp3", "--audio-quality", "0"])

    # Subtitles
    if subs:
        cmd.extend([
            "--write-sub",
            "--write-auto-sub",
            "--sub-lang", sub_lang,
            "--sub-format", "srt/vtt/best",
            "--convert-subs", "srt",
        ])

    # Playlist handling
    if not playlist:
        cmd.append("--no-playlist")
    if max_playlist:
        cmd.extend(["--playlist-end", str(max_playlist)])

    # Metadata
    cmd.extend([
        "--write-info-json",
        "--write-thumbnail",
        "--no-overwrites",
        "-o", output_path,
    ])

    # Cookies
    if cookies:
        cmd.extend(["--cookies", cookies])

    # Progress
    if quiet:
        cmd.extend(["--quiet", "--no-warnings"])
    else:
        cmd.append("--progress")

    # Extra args
    if extra_args:
        cmd.extend(extra_args)

    cmd.append(url)

    logger.info(f"Downloading: {url}")
    logger.debug(f"Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, capture_output=not sys.stdout.isatty(),
                               text=True, timeout=3600)

        if result.returncode != 0:
            error_msg = result.stderr[:1000] if result.stderr else "Unknown error"
            logger.error(f"Download failed: {error_msg}")
            return {"error": error_msg, "url": url}

        # Find the downloaded file(s)
        downloaded = _find_downloaded_files(out_dir, url)

        return {
            "success": True,
            "url": url,
            "files": downloaded,
            "output_dir": str(out_dir),
        }

    except subprocess.TimeoutExpired:
        return {"error": "Download timed out (1 hour limit)", "url": url}
    except Exception as e:
        return {"error": str(e), "url": url}


def _find_downloaded_files(out_dir: Path, url: str) -> list:
    """Find recently created files in output directory."""
    files = []
    cutoff = time.time() - 60  # Files created in the last minute

    for f in out_dir.iterdir():
        if f.stat().st_mtime > cutoff:
            files.append({
                "path": str(f),
                "name": f.name,
                "size": f.stat().st_size,
                "size_human": human_size(f.stat().st_size),
                "ext": f.suffix,
            })

    return sorted(files, key=lambda x: x["size"], reverse=True)


def download_subtitles(url: str, lang: str = "en", output_dir: str = None) -> dict:
    """Download subtitles/captions only."""
    out_dir = Path(output_dir) if output_dir else TRANSCRIPT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        YT_DLP,
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang", lang,
        "--sub-format", "srt/vtt/best",
        "--convert-subs", "srt",
        "--skip-download",
        "--no-playlist",
        "-o", str(out_dir / OUTPUT_TEMPLATE),
        url,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.returncode != 0:
        return {"error": result.stderr[:500]}

    # Find SRT files
    srt_files = list(out_dir.glob("*.srt"))
    vtt_files = list(out_dir.glob("*.vtt"))
    all_sub_files = srt_files + vtt_files

    # Find recently created ones
    cutoff = time.time() - 30
    new_files = [f for f in all_sub_files if f.stat().st_mtime > cutoff]

    if not new_files:
        return {"error": "No subtitles found for this video", "available_langs": _get_available_sub_langs(url)}

    # Read and clean subtitle text
    texts = {}
    for f in new_files:
        raw = f.read_text(encoding='utf-8', errors='replace')
        clean = _clean_srt(raw)
        texts[f.name] = {
            "path": str(f),
            "raw_length": len(raw),
            "clean_text": clean,
            "clean_length": len(clean),
        }

    return {
        "success": True,
        "files": texts,
    }


def _get_available_sub_langs(url: str) -> list:
    """Get available subtitle languages."""
    cmd = [YT_DLP, "--list-subs", "--no-download", "--no-playlist", url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return result.stdout[:1000]
    except:
        return []


def _clean_srt(srt_text: str) -> str:
    """Clean SRT subtitle text: remove timestamps, numbers, duplicates."""
    lines = srt_text.split('\n')
    clean_lines = []
    prev_line = ""

    for line in lines:
        line = line.strip()
        # Skip empty lines, sequence numbers, timestamps
        if not line:
            continue
        if re.match(r'^\d+$', line):
            continue
        if re.match(r'\d{2}:\d{2}:\d{2}', line):
            continue
        # Remove HTML tags
        line = re.sub(r'<[^>]+>', '', line)
        # Skip duplicate lines
        if line == prev_line:
            continue
        prev_line = line
        clean_lines.append(line)

    return ' '.join(clean_lines)


def extract_audio(filepath: str, output_path: str = None, format: str = "mp3") -> str:
    """Extract audio from a video file using ffmpeg."""
    inp = Path(filepath)
    if not inp.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    out = Path(output_path) if output_path else inp.with_suffix(f".{format}")

    cmd = [
        "ffmpeg", "-i", str(inp),
        "-vn",                    # No video
        "-acodec", "libmp3lame" if format == "mp3" else "copy",
        "-q:a", "0",             # Best quality
        "-y",                    # Overwrite
        str(out),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")

    return str(out)


def transcribe(audio_path: str, method: str = "auto", language: str = None,
               api_key: str = None) -> dict:
    """
    Transcribe audio to text.

    Methods:
      - whisper-api: OpenAI Whisper API (fast, accurate, costs money)
      - whisper-local: Local whisper model (slow, free, needs GPU)
      - subtitles: Use existing subtitles from the download
      - auto: Try subtitles first, then API, then local
    """
    audio = Path(audio_path)
    if not audio.exists():
        return {"error": f"Audio file not found: {audio_path}"}

    # Auto: try subtitles first
    if method == "auto":
        # Check for subtitle files alongside the audio/video
        srt_files = list(audio.parent.glob(f"{audio.stem}*.srt"))
        if srt_files:
            logger.info(f"Found subtitle file: {srt_files[0]}")
            raw = srt_files[0].read_text(encoding='utf-8', errors='replace')
            clean = _clean_srt(raw)
            return {
                "method": "subtitles",
                "text": clean,
                "language": "auto",
                "source": str(srt_files[0]),
                "chars": len(clean),
                "words": len(clean.split()),
            }

        # Try Whisper API
        api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if api_key:
            method = "whisper-api"
        else:
            # Try local
            method = "whisper-local"

    if method == "whisper-api":
        return _transcribe_whisper_api(audio_path, language, api_key)
    elif method == "whisper-local":
        return _transcribe_whisper_local(audio_path, language)
    else:
        return {"error": f"Unknown transcription method: {method}"}


def _transcribe_whisper_api(audio_path: str, language: str = None,
                            api_key: str = None) -> dict:
    """Transcribe using OpenAI Whisper API."""
    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"error": "No OPENAI_API_KEY set. Set it in environment or pass --api-key."}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        file_size = os.path.getsize(audio_path)
        max_size = 25 * 1024 * 1024  # 25MB API limit

        if file_size > max_size:
            # Split and transcribe in chunks
            return _transcribe_whisper_api_chunked(audio_path, language, client)

        with open(audio_path, "rb") as f:
            kwargs = {"model": "whisper-1", "file": f, "response_format": "verbose_json"}
            if language:
                kwargs["language"] = language

            logger.info(f"Transcribing via Whisper API ({human_size(file_size)})...")
            response = client.audio.transcriptions.create(**kwargs)

        text = response.text if hasattr(response, 'text') else str(response)
        segments = response.segments if hasattr(response, 'segments') else []
        detected_lang = response.language if hasattr(response, 'language') else None

        # Save transcript
        out_path = TRANSCRIPT_DIR / (Path(audio_path).stem + ".txt")
        out_path.write_text(text, encoding='utf-8')

        return {
            "method": "whisper-api",
            "text": text,
            "language": detected_lang or language,
            "segments": len(segments) if segments else 0,
            "chars": len(text),
            "words": len(text.split()),
            "saved_to": str(out_path),
        }

    except Exception as e:
        return {"error": f"Whisper API failed: {e}"}


def _transcribe_whisper_api_chunked(audio_path: str, language: str,
                                     client) -> dict:
    """Split large audio and transcribe in chunks."""
    logger.info("Audio > 25MB, splitting into chunks...")

    chunk_dir = Path(tempfile.mkdtemp(prefix="whisper_chunks_"))
    chunk_duration = 600  # 10 minutes per chunk

    # Get total duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", audio_path],
        capture_output=True, text=True, timeout=10
    )
    total_duration = float(probe.stdout.strip()) if probe.stdout.strip() else 3600

    chunks = []
    start = 0
    i = 0
    while start < total_duration:
        chunk_path = chunk_dir / f"chunk_{i:03d}.mp3"
        cmd = [
            "ffmpeg", "-i", audio_path,
            "-ss", str(start),
            "-t", str(chunk_duration),
            "-acodec", "libmp3lame", "-q:a", "2",
            "-y", str(chunk_path),
        ]
        subprocess.run(cmd, capture_output=True, timeout=60)
        if chunk_path.exists() and chunk_path.stat().st_size > 0:
            chunks.append(chunk_path)
        start += chunk_duration
        i += 1

    # Transcribe each chunk
    full_text = []
    for chunk in chunks:
        logger.info(f"Transcribing chunk {chunk.name}...")
        with open(chunk, "rb") as f:
            kwargs = {"model": "whisper-1", "file": f, "response_format": "text"}
            if language:
                kwargs["language"] = language
            response = client.audio.transcriptions.create(**kwargs)
            full_text.append(response if isinstance(response, str) else response.text)

    # Cleanup
    for chunk in chunks:
        chunk.unlink()
    chunk_dir.rmdir()

    text = " ".join(full_text)
    out_path = TRANSCRIPT_DIR / (Path(audio_path).stem + ".txt")
    out_path.write_text(text, encoding='utf-8')

    return {
        "method": "whisper-api-chunked",
        "text": text,
        "language": language,
        "chunks": len(chunks),
        "chars": len(text),
        "words": len(text.split()),
        "saved_to": str(out_path),
    }


def _transcribe_whisper_local(audio_path: str, language: str = None) -> dict:
    """Transcribe using local Whisper model."""
    try:
        import whisper
        logger.info("Loading local Whisper model (base)...")
        model = whisper.load_model("base")
        logger.info("Transcribing locally...")

        kwargs = {"fp16": False}
        if language:
            kwargs["language"] = language

        result = model.transcribe(audio_path, **kwargs)
        text = result.get("text", "")

        out_path = TRANSCRIPT_DIR / (Path(audio_path).stem + ".txt")
        out_path.write_text(text, encoding='utf-8')

        return {
            "method": "whisper-local",
            "text": text,
            "language": result.get("language"),
            "segments": len(result.get("segments", [])),
            "chars": len(text),
            "words": len(text.split()),
            "saved_to": str(out_path),
        }
    except ImportError:
        return {"error": "openai-whisper not installed. Run: pip3 install openai-whisper"}
    except Exception as e:
        return {"error": f"Local transcription failed: {e}"}


def search(query: str, site: str = "youtube", limit: int = 10) -> list:
    """Search for videos on a platform."""
    search_url = f"ytsearch{limit}:{query}" if site == "youtube" else f"{site}search{limit}:{query}"

    cmd = [
        YT_DLP,
        "--dump-json",
        "--no-download",
        "--flat-playlist",
        search_url,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        entries = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return entries
    except Exception as e:
        return [{"error": str(e)}]


# ==================== CLI ====================

def main():
    parser = argparse.ArgumentParser(
        description="Media Fetch — Download and process media from 1000+ sites",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s https://youtube.com/watch?v=xyz                  # Download video
  %(prog)s https://youtube.com/watch?v=xyz --audio           # Audio only (MP3)
  %(prog)s https://youtube.com/watch?v=xyz --transcript      # Download + transcribe
  %(prog)s https://youtube.com/watch?v=xyz --subs            # Subtitles only
  %(prog)s https://youtube.com/watch?v=xyz --info            # Metadata only
  %(prog)s https://youtube.com/watch?v=xyz --quality 720     # 720p max
  %(prog)s https://youtube.com/watch?v=xyz --clip 1:30-3:00  # Download clip
  %(prog)s --search "prop trading strategies"                 # Search YouTube
  %(prog)s https://open.spotify.com/episode/xyz --audio      # Podcast audio
  %(prog)s https://twitter.com/user/status/123               # Twitter video
        """
    )
    parser.add_argument('url', nargs='?', help='URL to download')

    # Mode flags
    parser.add_argument('--info', '-i', action='store_true', help='Metadata only (no download)')
    parser.add_argument('--audio', '-a', action='store_true', help='Audio only (MP3)')
    parser.add_argument('--transcript', '-t', action='store_true', help='Download + transcribe')
    parser.add_argument('--subs', action='store_true', help='Download subtitles only')
    parser.add_argument('--search', '-s', type=str, help='Search YouTube')

    # Quality/format
    parser.add_argument('--quality', '-q', choices=['best', '720', '480', 'audio'], default='best')
    parser.add_argument('--format', '-f', type=str, help='yt-dlp format string')

    # Subtitles
    parser.add_argument('--sub-lang', default='en', help='Subtitle language (default: en)')

    # Playlist
    parser.add_argument('--playlist', '-p', action='store_true', help='Download full playlist')
    parser.add_argument('--max-playlist', type=int, help='Max playlist items')

    # Output
    parser.add_argument('--output-dir', '-o', type=str, help='Output directory')
    parser.add_argument('--filename', type=str, help='Output filename template')

    # Transcription
    parser.add_argument('--transcribe-method', choices=['auto', 'whisper-api', 'whisper-local', 'subtitles'],
                        default='auto', help='Transcription method')
    parser.add_argument('--api-key', type=str, help='OpenAI API key for Whisper')
    parser.add_argument('--language', type=str, help='Audio/subtitle language code')

    # Clip extraction
    parser.add_argument('--clip', type=str, help='Extract clip: START-END (e.g., 1:30-3:00)')

    # Misc
    parser.add_argument('--cookies', type=str, help='Cookies file for authentication')
    parser.add_argument('--quiet', action='store_true', help='Suppress progress output')
    parser.add_argument('--json', action='store_true', help='JSON output')
    parser.add_argument('--extra', nargs='*', help='Extra yt-dlp arguments')

    args = parser.parse_args()

    # ---- Search mode ----
    if args.search:
        results = search(args.search, limit=10)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            for i, r in enumerate(results):
                if r.get('error'):
                    print(f"Error: {r['error']}")
                    continue
                dur = human_duration(r.get('duration'))
                views = f"{r.get('view_count', 0):,}" if isinstance(r.get('view_count'), int) else '?'
                channel = r.get('channel', r.get('uploader', '?'))
                print(f"  {i+1:2d}. [{dur:>8s}] {r.get('title', '?')[:70]}")
                print(f"      {channel} | {views} views | https://youtube.com/watch?v={r.get('id', '?')}")
        return

    if not args.url:
        parser.print_help()
        return

    # ---- Info mode ----
    if args.info:
        info = get_info(args.url, playlist=args.playlist)
        if args.json:
            print(json.dumps(info, indent=2, default=str))
        else:
            print(format_info(info))

        # Save metadata
        title = sanitize_filename(info.get('title', 'unknown'))
        meta_path = METADATA_DIR / f"{title}.json"
        meta_path.write_text(json.dumps(info, indent=2, default=str), encoding='utf-8')
        return

    # ---- Subs mode ----
    if args.subs:
        result = download_subtitles(args.url, lang=args.sub_lang,
                                    output_dir=args.output_dir)
        if args.json:
            print(json.dumps(result, indent=2))
        elif result.get("error"):
            print(f"❌ {result['error']}")
            if result.get("available_langs"):
                print(f"\nAvailable languages:\n{result['available_langs']}")
        else:
            for name, data in result.get("files", {}).items():
                print(f"✅ {name}")
                print(f"   Path: {data['path']}")
                print(f"   Clean text ({data['clean_length']} chars):")
                # Print first 500 chars
                preview = data['clean_text'][:500]
                if len(data['clean_text']) > 500:
                    preview += "..."
                print(f"   {preview}")
        return

    # ---- Download ----
    extra = []

    # Clip extraction
    if args.clip:
        match = re.match(r'([\d:]+)-([\d:]+)', args.clip)
        if match:
            start, end = match.groups()
            extra.extend(["--download-sections", f"*{start}-{end}"])

    result = download(
        url=args.url,
        output_dir=args.output_dir,
        audio_only=args.audio or args.transcript,
        format_spec=args.format,
        quality=args.quality,
        subs=args.subs or args.transcript,
        sub_lang=args.sub_lang,
        playlist=args.playlist,
        max_playlist=args.max_playlist,
        filename=args.filename,
        quiet=args.quiet,
        cookies=args.cookies,
        extra_args=extra + (args.extra or []),
    )

    if result.get("error"):
        print(f"❌ {result['error']}")
        return

    # Print results
    if not args.quiet:
        print(f"\n✅ Downloaded to {result['output_dir']}")
        for f in result.get("files", []):
            print(f"   {f['name']} ({f['size_human']})")

    # ---- Transcript mode ----
    if args.transcript:
        audio_files = [f for f in result.get("files", [])
                       if f['ext'] in ('.mp3', '.m4a', '.wav', '.ogg', '.opus', '.webm')]

        if not audio_files:
            # Try using the video file directly
            all_files = [f for f in result.get("files", [])
                        if f['ext'] in ('.mp4', '.mkv', '.webm')]
            if all_files:
                audio_files = all_files

        if not audio_files:
            print("❌ No audio file found for transcription")
            return

        audio_path = audio_files[0]['path']
        print(f"\n🎤 Transcribing {audio_files[0]['name']}...")

        transcript = transcribe(
            audio_path=audio_path,
            method=args.transcribe_method,
            language=args.language,
            api_key=args.api_key,
        )

        if args.json:
            print(json.dumps(transcript, indent=2))
        elif transcript.get("error"):
            print(f"❌ Transcription failed: {transcript['error']}")
        else:
            print(f"\n📝 Transcript ({transcript['method']}, {transcript['words']} words, {transcript.get('language', '?')}):")
            if transcript.get('saved_to'):
                print(f"   Saved to: {transcript['saved_to']}")
            print("─" * 60)
            # Print first 2000 chars
            text = transcript['text']
            if len(text) > 2000:
                print(text[:2000])
                print(f"\n... [{len(text) - 2000} more chars, see {transcript.get('saved_to', 'full file')}]")
            else:
                print(text)


if __name__ == '__main__':
    main()
