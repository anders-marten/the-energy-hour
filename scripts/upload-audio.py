#!/usr/bin/env python3
"""Upload encoded audio to the media bucket and point playlist.json at it.

Reads audio-manifest.json written by scripts/encode-audio.py. Uses the
credentials of the active Scaleway CLI profile (never printed). Objects are
named by content hash, so existing objects are skipped and nothing is ever
overwritten or deleted.

Every uploaded file is then fetched once in full through the public URL, so
each Edge Services node caches it. The cache is only filled by full GETs; the
range requests a browser's audio player makes do not fill it.

Usage:
  scripts/upload-audio.py [--ids ID,ID,...] [--dry-run] [--warm-only]
"""

import argparse
import json
import os
import socket
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


def edge_addresses():
    host = PUBLIC_BASE.split("://", 1)[1]
    return host, sorted({info[4][0] for info in socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)})


def warm_cache(url):
    """Fetch the whole file through every edge node so each caches it.

    The domain resolves to several edge nodes with separate caches, so the
    file is fetched once per node. Returns the cache status per node after
    warming, for example "hit-fresh,hit-fresh".
    """
    host, addresses = edge_addresses()
    statuses = []
    for address in addresses:
        pin = ["--resolve", f"{host}:443:{address}"]
        subprocess.run(["curl", "-sS", "--fail", "-o", os.devnull, *pin, url], check=True, timeout=180)
        head = subprocess.run(["curl", "-sS", "-o", os.devnull, "-D", "-", "-H", "Range: bytes=0-1023", *pin, url],
                              capture_output=True, text=True, check=True, timeout=30).stdout
        status = next((line.split(":", 1)[1].strip() for line in head.splitlines()
                       if line.lower().startswith("x-cache:")), "unknown")
        statuses.append(status)
    return ",".join(statuses)


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
    parser.add_argument("--warm-only", action="store_true", help="only fetch the files to fill the CDN cache")
    args = parser.parse_args()

    manifest = json.loads((args.media / "audio-manifest.json").read_text(encoding="utf-8"))
    if args.ids:
        wanted = set(args.ids.split(","))
        missing = wanted - manifest.keys()
        if missing:
            sys.exit(f"ids not in audio-manifest.json: {', '.join(sorted(missing))}")
        manifest = {k: v for k, v in manifest.items() if k in wanted}

    if args.warm_only:
        failures = 0
        for entry in manifest.values():
            url = f"{PUBLIC_BASE}/{entry['file']}"
            try:
                print(f"warm {warm_cache(url):<10} {url}")
            except Exception as error:
                failures += 1
                print(f"FAIL {url}: {error}")
        sys.exit(1 if failures else 0)

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
            warm_cache(url)
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
