#!/usr/bin/env python3
"""Run OpenTofu with the existing Scaleway CLI profile."""

import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent


def config(key):
    return subprocess.check_output(["scw", "config", "get", key], text=True).strip()


env = dict(os.environ)
env.update(
    AWS_ACCESS_KEY_ID=config("access-key"),
    AWS_SECRET_ACCESS_KEY=config("secret-key"),
)
env.update(
    SCW_ACCESS_KEY=env["AWS_ACCESS_KEY_ID"],
    SCW_SECRET_KEY=env["AWS_SECRET_ACCESS_KEY"],
    SCW_DEFAULT_PROJECT_ID=config("default-project-id"),
    SCW_DEFAULT_ORGANIZATION_ID=config("default-organization-id"),
)

sys.exit(
    subprocess.run(
        ["tofu", *sys.argv[1:]],
        cwd=ROOT / "infra",
        env=env,
    ).returncode
)
