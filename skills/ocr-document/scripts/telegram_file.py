#!/usr/bin/env python3
"""
Download files from Telegram using Bot API.
Handles documents, photos, and any file type.

Usage:
    python3 telegram_file.py --file-id <id> --output /path/to/file.pdf
    python3 telegram_file.py --chat-id <your-telegram-user-id> --recent   # Get most recent document
"""
import argparse, os, sys, json, requests

def get_bot_token():
    """Read bot token from openclaw config."""
    config_paths = [
        os.path.expanduser("~/.openclaw-argus/openclaw.json"),
        os.path.expanduser("~/.openclaw/openclaw.json"),
    ]
    for path in config_paths:
        if os.path.exists(path):
            with open(path) as f:
                cfg = json.load(f)
                token = cfg.get("telegram", {}).get("botToken")
                if token:
                    return token
    return os.environ.get("TELEGRAM_BOT_TOKEN")


def download_file(token, file_id, output_path):
    """Download a file from Telegram by file_id."""
    # Get file path from Telegram
    resp = requests.get(f"https://api.telegram.org/bot{token}/getFile", 
                       params={"file_id": file_id}, timeout=15)
    data = resp.json()
    if not data.get("ok"):
        print(f"Error getting file: {data}", file=sys.stderr)
        return None
    
    file_path = data["result"]["file_path"]
    file_size = data["result"].get("file_size", 0)
    
    # Download
    url = f"https://api.telegram.org/file/bot{token}/{file_path}"
    resp = requests.get(url, timeout=60)
    
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(resp.content)
    
    print(f"Downloaded: {output_path} ({len(resp.content)} bytes)")
    return output_path


def get_recent_document(token, chat_id):
    """Try to find recent document from updates (if not yet consumed)."""
    # This won't work if updates are consumed, but worth trying
    resp = requests.get(f"https://api.telegram.org/bot{token}/getUpdates",
                       params={"limit": 100, "allowed_updates": json.dumps(["message"])},
                       timeout=15)
    data = resp.json()
    
    for update in reversed(data.get("result", [])):
        msg = update.get("message", {})
        if str(msg.get("chat", {}).get("id")) == str(chat_id):
            doc = msg.get("document")
            if doc:
                return doc
    
    return None


def main():
    parser = argparse.ArgumentParser(description="Download Telegram files")
    parser.add_argument("--file-id", help="Telegram file_id")
    parser.add_argument("--chat-id", help="Chat ID to search for recent docs")
    parser.add_argument("--recent", action="store_true", help="Get most recent document")
    parser.add_argument("--output", "-o", default="downloaded_file", help="Output path")
    parser.add_argument("--token", help="Bot token (reads from config by default)")
    args = parser.parse_args()
    
    token = args.token or get_bot_token()
    if not token:
        print("No bot token found", file=sys.stderr)
        sys.exit(1)
    
    if args.file_id:
        download_file(token, args.file_id, args.output)
    elif args.recent and args.chat_id:
        doc = get_recent_document(token, args.chat_id)
        if doc:
            ext = os.path.splitext(doc.get("file_name", ""))[1] or ".bin"
            output = args.output if "." in args.output else args.output + ext
            print(f"Found: {doc.get('file_name')} ({doc.get('file_size')} bytes, {doc.get('mime_type')})")
            download_file(token, doc["file_id"], output)
        else:
            print("No recent document found in updates (may have been consumed)", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
