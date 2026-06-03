#!/usr/bin/env python3
"""
Batch Media Operations — Process multiple URLs or extract audio from local files.

Usage:
  python3 batch.py urls.txt [--audio] [--transcript] [--output-dir DIR]
  python3 batch.py --file video.mp4 --extract-audio
  python3 batch.py --file audio.mp3 --transcribe
  python3 batch.py --playlist URL [--max 10] [--audio]
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import download, extract_audio, transcribe, get_info, format_info, human_size


def process_url_list(url_file: str, audio: bool = False, transcript: bool = False,
                     output_dir: str = None, quiet: bool = False) -> list:
    """Process a file containing one URL per line."""
    urls = Path(url_file).read_text().strip().split('\n')
    urls = [u.strip() for u in urls if u.strip() and not u.startswith('#')]

    print(f"Processing {len(urls)} URL(s)...\n")
    results = []

    for i, url in enumerate(urls):
        print(f"[{i+1}/{len(urls)}] {url}")
        result = download(
            url=url,
            output_dir=output_dir,
            audio_only=audio or transcript,
            subs=transcript,
            quiet=quiet,
        )

        if result.get("error"):
            print(f"  ❌ {result['error']}")
        else:
            for f in result.get("files", []):
                print(f"  ✅ {f['name']} ({f['size_human']})")

            if transcript and result.get("files"):
                audio_file = result["files"][0]["path"]
                print(f"  🎤 Transcribing...")
                tr = transcribe(audio_file)
                if tr.get("text"):
                    print(f"  📝 {tr['words']} words → {tr.get('saved_to', '?')}")
                else:
                    print(f"  ❌ Transcription: {tr.get('error', '?')}")
                result["transcript"] = tr

        results.append(result)

    return results


def process_local_file(filepath: str, action: str = "extract-audio",
                       output: str = None, language: str = None,
                       api_key: str = None) -> dict:
    """Process a local media file."""
    if action == "extract-audio":
        out_path = extract_audio(filepath, output)
        size = Path(out_path).stat().st_size
        print(f"✅ Extracted audio: {out_path} ({human_size(size)})")
        return {"path": out_path, "size": size}

    elif action == "transcribe":
        print(f"🎤 Transcribing {filepath}...")
        result = transcribe(filepath, language=language, api_key=api_key)
        if result.get("error"):
            print(f"❌ {result['error']}")
        else:
            print(f"📝 {result['words']} words ({result['method']})")
            if result.get('saved_to'):
                print(f"   Saved: {result['saved_to']}")
            print("─" * 60)
            text = result['text']
            print(text[:3000] if len(text) > 3000 else text)
        return result

    elif action == "info":
        # ffprobe local file info
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filepath],
            capture_output=True, text=True, timeout=10
        )
        info = json.loads(result.stdout) if result.stdout else {}
        print(json.dumps(info, indent=2))
        return info


def main():
    parser = argparse.ArgumentParser(description="Batch Media Operations")
    parser.add_argument('input', nargs='?', help='URL list file or --file path')

    parser.add_argument('--file', type=str, help='Local file to process')
    parser.add_argument('--extract-audio', action='store_true', help='Extract audio from local file')
    parser.add_argument('--transcribe', action='store_true', help='Transcribe audio/video file')
    parser.add_argument('--file-info', action='store_true', help='Show file info (ffprobe)')

    parser.add_argument('--audio', '-a', action='store_true', help='Download as audio only')
    parser.add_argument('--transcript', '-t', action='store_true', help='Download + transcribe')
    parser.add_argument('--output-dir', '-o', type=str, help='Output directory')
    parser.add_argument('--quiet', '-q', action='store_true')
    parser.add_argument('--language', type=str, help='Language code')
    parser.add_argument('--api-key', type=str, help='OpenAI API key')
    parser.add_argument('--output', type=str, help='Output file path for extraction')

    args = parser.parse_args()

    # Local file operations
    if args.file:
        if args.extract_audio:
            process_local_file(args.file, "extract-audio", args.output)
        elif args.transcribe:
            process_local_file(args.file, "transcribe", language=args.language, api_key=args.api_key)
        elif args.file_info:
            process_local_file(args.file, "info")
        else:
            parser.error("Specify --extract-audio, --transcribe, or --file-info with --file")
        return

    # URL list
    if args.input:
        results = process_url_list(
            args.input,
            audio=args.audio,
            transcript=args.transcript,
            output_dir=args.output_dir,
            quiet=args.quiet,
        )
        print(f"\nDone: {sum(1 for r in results if r.get('success'))}/{len(results)} succeeded")
        return

    parser.print_help()


if __name__ == '__main__':
    main()
