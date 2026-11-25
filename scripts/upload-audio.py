#!/usr/bin/env python3
"""Upload encoded audio to the media bucket and point playlist.json at it.

Reads audio-manifest.json written by scripts/encode-audio.py. Uses the
credentials of the active Scaleway CLI profile (never printed). Objects are
named by content hash, so existing objects are skipped and nothing is ever
overwritten or deleted.

Usage:
  scripts/upload-audio.py [--ids ID,ID,...] [--dry-run]
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST = ROOT / "public" / "playlist.json"
DEFAULT_MEDIA = Path.home() / "Music" / "the-energy-hour-media"
BUCKET = "the-energy-hour-media"
ENDPOINT = "https://s3.fr-par.scw.cloud"
REGION = "fr-par"
PUBLIC_BASE = "https://media.the-energy-hour.com"
CACHE_CONTROL = "public, max-age=31536000, immutable"


def scw_env():
    def config(key):
        return subprocess.check_output(["scw", "config", "get", key], text=True).strip()

    env = {k: v for k, v in os.environ.items() if not k.startswith("AWS_")}
    env.update(AWS_ACCESS_KEY_ID=config("access-key"), AWS_SECRET_ACCESS_KEY=config("secret-key"))
    return env


def aws(env, *args, check=True):
    return subprocess.run(["aws", *args, "--endpoint-url", ENDPOINT, "--region", REGION],
                          env=env, capture_output=True, text=True, check=check)


def public_ok(url, content_type, size):
    request = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(request, timeout=30) as response:
        return (response.status == 200
                and response.headers.get("Content-Type") == content_type
                and int(response.headers.get("Content-Length", -1)) == size)


def update_playlist(entries):
    tracks = json.loads(PLAYLIST.read_text(encoding="utf-8"))
    updated = []
    for track in tracks:
        entry = entries.get(track.get("id"))
        if entry:
            rebuilt = {}
            for key, value in track.items():
                if key in ("audio", "duration"):
                    continue
                rebuilt[key] = value
                if key == "credits":
                    rebuilt["audio"] = f"{PUBLIC_BASE}/{entry['file']}"
                    rebuilt["duration"] = entry["duration"]
            if "audio" not in rebuilt:
                rebuilt["audio"] = f"{PUBLIC_BASE}/{entry['file']}"
                rebuilt["duration"] = entry["duration"]
            track = rebuilt
        updated.append(track)
    PLAYLIST.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--media", type=Path, default=DEFAULT_MEDIA)
    parser.add_argument("--ids", help="comma-separated track ids (default: all in the manifest)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    manifest = json.loads((args.media / "audio-manifest.json").read_text(encoding="utf-8"))
    if args.ids:
        wanted = set(args.ids.split(","))
        missing = wanted - manifest.keys()
        if missing:
            sys.exit(f"ids not in audio-manifest.json: {', '.join(sorted(missing))}")
        manifest = {k: v for k, v in manifest.items() if k in wanted}

    env = scw_env()
    done, failures = {}, 0
    for track_id, entry in manifest.items():
        key, path = entry["file"], args.media / entry["file"]
        url = f"{PUBLIC_BASE}/{key}"
        try:
            exists = aws(env, "s3api", "head-object", "--bucket", BUCKET, "--key", key, check=False).returncode == 0
            if args.dry_run:
                print(f"{'skip' if exists else 'put '} {key}")
                continue
            if not exists:
                aws(env, "s3", "cp", str(path), f"s3://{BUCKET}/{key}", "--only-show-errors",
                    "--content-type", entry["content_type"], "--cache-control", CACHE_CONTROL)
            if not public_ok(url, entry["content_type"], entry["bytes"]):
                raise RuntimeError("public HEAD check failed")
            done[track_id] = entry
            print(f"{'kept' if exists else 'put '} {url}")
        except Exception as error:
            failures += 1
            print(f"FAIL {track_id} {key}: {error}")

    if done and not args.dry_run:
        update_playlist(done)
        print(f"playlist.json updated for {len(done)} tracks")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
