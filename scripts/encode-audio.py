#!/usr/bin/env python3
"""Encode the SoundCloud originals into web audio files for media.the-energy-hour.com.

Reads manifest.tsv in the originals folder (written when the originals were
downloaded) and public/playlist.json for titles. Output goes to a folder
outside the repo, together with audio-manifest.json.

- Lossless (WAV/AIFF): AAC-LC 256 kbps constrained VBR with Apple's encoder
  (afconvert, full source precision), then remuxed with ffmpeg for fast start
  and clean metadata.
- AAC: lossless remux only (fast start, clean metadata).
- MP3: lossless remux only (tags and embedded cover art removed).

No loudness or other processing. File names are <track id>-<sha256[:8]>.<ext>.

Usage:
  scripts/encode-audio.py [--ids ID,ID,...]
"""

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST = ROOT / "public" / "playlist.json"
DEFAULT_ORIGINALS = Path.home() / "Music" / "the-energy-hour-originals"
DEFAULT_OUT = Path.home() / "Music" / "the-energy-hour-media"
ARTIST = "The Energy Hour"
BITRATE = 256000
DURATION_TOLERANCE = 0.5


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {result.stderr.strip()[:500]}")
    return result.stdout


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).strip())


def moov_first(path):
    data = path.read_bytes()[:4_000_000]
    moov, mdat = data.find(b"moov"), data.find(b"mdat")
    return moov != -1 and (mdat == -1 or moov < mdat)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def remux(source, target, title, fmt):
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-map", "0:a:0", "-c", "copy",
           "-map_metadata", "-1", "-map_chapters", "-1",
           "-metadata", f"title={title}", "-metadata", f"artist={ARTIST}"]
    if fmt == "m4a":
        cmd += ["-movflags", "+faststart", "-f", "mp4"]
    else:
        cmd += ["-id3v2_version", "3", "-f", "mp3"]
    run(cmd + [str(target)])


def encode_track(row, title, originals, out, tmp):
    source = originals / row["file"]
    codec = row["codec"]
    if codec.startswith("pcm_"):
        fmt, kind = "m4a", "aac-256"
        encoded = tmp / "encoded.m4a"
        # -s 2 = constrained VBR, -q 127 = highest encoder quality.
        run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE), "-s", "2", "-q", "127",
             str(source), str(encoded)])
        stage_source = encoded
    elif codec == "aac":
        fmt, kind, stage_source = "m4a", "aac-remux", source
    elif codec == "mp3":
        fmt, kind, stage_source = "mp3", "mp3-remux", source
    else:
        raise RuntimeError(f"unsupported codec {codec}")

    staged = tmp / f"staged.{fmt}"
    remux(stage_source, staged, title, fmt)

    src_len, out_len = float(row["seconds"]), duration(staged)
    if abs(src_len - out_len) > DURATION_TOLERANCE:
        raise RuntimeError(f"duration {out_len:.2f}s differs from original {src_len:.2f}s")
    if fmt == "m4a" and not moov_first(staged):
        raise RuntimeError("moov atom is not first")

    name = f"{row['id']}-{sha256(staged)[:8]}.{fmt}"
    target = out / name
    if not target.exists():
        shutil.move(str(staged), target)
    return {
        "file": name,
        "bytes": target.stat().st_size,
        "duration": round(out_len, 2),
        "content_type": "audio/mp4" if fmt == "m4a" else "audio/mpeg",
        "kind": kind,
        "source": row["file"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--originals", type=Path, default=DEFAULT_ORIGINALS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--ids", help="comma-separated track ids (default: all)")
    args = parser.parse_args()

    titles = {t["id"]: t["title"] for t in json.loads(PLAYLIST.read_text(encoding="utf-8"))}
    with (args.originals / "manifest.tsv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    wanted = set(args.ids.split(",")) if args.ids else None
    if wanted:
        rows = [r for r in rows if r["id"] in wanted]
        missing = wanted - {r["id"] for r in rows}
        if missing:
            sys.exit(f"ids not in manifest: {', '.join(sorted(missing))}")

    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "audio-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    failures = 0
    for row in rows:
        title = titles.get(row["id"], row["title"])
        try:
            with tempfile.TemporaryDirectory() as tmp:
                entry = encode_track(row, title, args.originals, args.out, Path(tmp))
            manifest[row["id"]] = entry
            print(f"ok   {row['id']}  {entry['kind']:<10} {entry['bytes'] / 1e6:6.1f} MB  {entry['duration']:7.2f}s  {title}")
        except Exception as error:  # report and continue with the next track
            failures += 1
            print(f"FAIL {row['id']}  {title}: {error}")

    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(rows) - failures} encoded, {failures} failed; manifest: {manifest_path}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
