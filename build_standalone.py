#!/usr/bin/env python3
"""Build a single standalone static HTML file for the IIC API docs.

The normal site (web/index.html + app.js) relies on nginx to:
  * serve index.html / app.js / styles.css from web/
  * serve the OpenAPI specs (iam.yaml, mcc.yaml, vps.yaml, vrm.yaml) from swagger/

When you open index.html directly via file://, the browser cannot fetch the
sibling .yaml files (Stoplight uses fetch(), which is blocked for file:// or
fails because the relative path no longer resolves through nginx).

This script produces a SINGLE self-contained .html file that:
  * inlines styles.css
  * inlines app.js (patched to use the embedded specs instead of fetching URLs)
  * embeds every swagger/*.yaml document inside <script> tags
  * keeps the Stoplight Elements assets on the CDN (so you still need internet
    the first time), or optionally vendors them locally (see --offline).

Usage:
    python3 build_standalone.py                # writes dist/iic-api-docs.html
    python3 build_standalone.py -o out.html    # custom output path
    python3 build_standalone.py --offline      # also download Stoplight assets
                                               # and inline them (fully offline)

Just double-click the resulting .html (or open it with file://) in a browser.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

# Repo layout ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
SWAGGER_DIR = ROOT / "swagger"

# The specs are auto-discovered by scanning swagger/*.yaml at build time, so
# adding/removing a spec needs no edits here (or in index.html). The display
# order is alphabetical by file name.

# Stoplight Elements assets (the same versions index.html references).
STOPLIGHT_JS = "https://unpkg.com/@stoplight/elements/web-components.min.js"
STOPLIGHT_CSS = "https://unpkg.com/@stoplight/elements/styles.min.css"


def discover_specs() -> list[Path]:
    """Return the swagger/*.yaml (and *.yml) files, sorted by name."""
    if not SWAGGER_DIR.is_dir():
        sys.exit(f"error: swagger directory not found: {SWAGGER_DIR}")
    files = sorted(
        p for p in SWAGGER_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in (".yaml", ".yml")
    )
    if not files:
        sys.exit(f"error: no .yaml/.yml specs found in {SWAGGER_DIR}")
    return files


def spec_label(path: Path) -> str:
    """Derive a tab label from a spec file name (e.g. iam.yaml -> 'IAM')."""
    return path.stem.upper()


def _slugify(text: str) -> str:
    """Lower-case, keep [a-z0-9], collapse everything else to single hyphens."""
    out = []
    prev_hyphen = False
    for ch in text.lower():
        if ("a" <= ch <= "z") or ("0" <= ch <= "9"):
            out.append(ch)
            prev_hyphen = False
        elif not prev_hyphen:
            out.append("-")
            prev_hyphen = True
    return "".join(out).strip("-")


def server_id(description: str, url: str) -> str:
    """Build a stable identifier for a server from its description + exact url.

    Keying on description AND the exact (un-normalized) url avoids collisions
    between servers that differ only by a trailing slash or only by their
    description (both occur in the current swagger specs).
    """
    return _slugify(f"{description}--{url}") or "server"


def parse_servers(spec_text: str) -> list[dict[str, str]]:
    """Extract the top-level OpenAPI `servers` list from raw YAML text.

    The build intentionally stays dependency-free (it embeds raw YAML strings
    rather than parsing full documents), so this is a small, targeted parser
    for just the top-level `servers:` block rather than a general YAML loader.

    It recognizes the shape used by the project's specs:

        servers:
          - url: https://example/api/v1
            description: AI-Cloud

    Returns an ordered list of {id, label, url}. Specs that declare no
    top-level `servers` key yield an empty list.
    """
    lines = spec_text.splitlines()
    # Find the top-level `servers:` key (no leading indentation).
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^servers:\s*(#.*)?$", line):
            start = i + 1
            break
    if start is None:
        return []

    servers: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    def _unquote(value: str) -> str:
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            return value[1:-1]
        return value

    for line in lines[start:]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # A non-indented, non-list line marks the next top-level key: stop.
        if not line.startswith((" ", "\t")) and not line.lstrip().startswith("-"):
            break

        stripped = line.strip()
        if stripped.startswith("-"):
            # Start of a new server list item.
            current = {}
            servers.append(current)
            stripped = stripped[1:].strip()
            if not stripped:
                continue
        if current is None:
            continue
        if ":" in stripped:
            key, _, value = stripped.partition(":")
            current[key.strip()] = _unquote(value)

    result: list[dict[str, str]] = []
    for srv in servers:
        url = srv.get("url", "")
        if not url:
            continue
        description = srv.get("description", "")
        result.append(
            {
                "id": server_id(description, url),
                "label": description or url,
                "url": url,
            }
        )
    return result


def build_specs_list(spec_paths: list[Path]) -> list[dict]:
    """Build the ordered tab + server metadata list from spec paths.

    Each entry is { file, label, servers: [{id, label, url}, ...] }. Specs that
    declare no `servers` get an empty list rather than being omitted, so they
    still appear as tabs and fall back to a per-spec credential context in the
    frontend.
    """
    specs_list: list[dict] = []
    for p in spec_paths:
        specs_list.append(
            {
                "file": p.name,
                "label": spec_label(p),
                "servers": parse_servers(read_text(p)),
            }
        )
    return specs_list


def write_specs_json(spec_paths: list[Path] | None = None) -> Path:
    """Write web/specs.json so the nginx-served site can build its tabs.

    The browser cannot list the swagger/ directory, so app.js fetches this
    file at load time. Re-run this whenever specs are added/removed. The
    standalone HTML does NOT need it (the list is embedded), but generating it
    here keeps a single source of truth.
    """
    if spec_paths is None:
        spec_paths = discover_specs()
    specs_list = build_specs_list(spec_paths)
    out = WEB_DIR / "specs.json"
    out.write_text(json.dumps(specs_list, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {out} ({', '.join(s['file'] for s in specs_list)})")
    return out


def read_text(path: Path) -> str:
    if not path.is_file():
        sys.exit(f"error: required file not found: {path}")
    return path.read_text(encoding="utf-8")


def fetch_url(url: str) -> str:
    print(f"  downloading {url} ...")
    with urllib.request.urlopen(url) as resp:  # noqa: S310 (trusted CDN)
        return resp.read().decode("utf-8")


def patch_app_js(app_js: str) -> str:
    """Rewrite app.js so it uses embedded specs instead of fetching by URL.

    Two things change:

    1. The initial <elements-api> in index.html still has
       apiDescriptionUrl="iam.yaml". We add a small bootstrap that converts
       any apiDescriptionUrl into an inlined apiDescriptionDocument using the
       embedded SPECS map, both for the static element and for the elements
       created dynamically in switchApi().

    2. switchApi() sets apiDescriptionUrl on the new element. We patch that
       call site to set apiDescriptionDocument from window.__SPECS__ instead.
    """
    # In switchApi() the new element is configured with:
    #   next.setAttribute('apiDescriptionUrl', file);
    # Replace it so it uses the embedded document keyed by `file`.
    patched = app_js.replace(
        "next.setAttribute('apiDescriptionUrl', file);",
        "next.setAttribute('apiDescriptionDocument', window.__SPECS__[file]);",
    )

    if patched == app_js:
        # Guard against the source changing in a way that breaks the patch.
        print(
            "  warning: could not find the apiDescriptionUrl line in app.js;\n"
            "           the standalone file may still try to fetch specs."
        )

    return patched


def build(output: Path, offline: bool) -> None:
    print("Reading source files ...")
    index_html = read_text(WEB_DIR / "index.html")
    app_js = read_text(WEB_DIR / "app.js")
    styles_css = read_text(WEB_DIR / "styles.css")

    print("Reading OpenAPI specs ...")
    spec_paths = discover_specs()
    specs: dict[str, str] = {}
    for path in spec_paths:
        specs[path.name] = read_text(path)
    specs_list = build_specs_list(spec_paths)
    print("  found: " + ", ".join(s["file"] for s in specs_list))

    # Keep web/specs.json in sync so the nginx-served site stays auto-updated.
    print("Writing web/specs.json ...")
    write_specs_json(spec_paths)

    # Build the JSON map of file-name -> raw YAML string. json.dumps gives us a
    # safe JS string literal (escapes quotes, newlines, </script>, etc. we add
    # the </script> guard below for safety inside a <script> block).
    specs_json = json.dumps(specs, ensure_ascii=False)
    # Prevent a literal </script> inside a spec from closing our script tag.
    specs_json = specs_json.replace("</", "<\\/")

    # The ordered list of { file, label } used to build the top-bar tabs.
    specs_list_json = json.dumps(specs_list, ensure_ascii=False).replace("</", "<\\/")

    patched_app_js = patch_app_js(app_js)

    # Stoplight assets: CDN reference (default) or inlined (offline).
    if offline:
        print("Downloading Stoplight Elements assets for offline use ...")
        stoplight_js = fetch_url(STOPLIGHT_JS)
        stoplight_css = fetch_url(STOPLIGHT_CSS)
        stoplight_js_tag = f"<script>{stoplight_js}</script>"
        stoplight_css_tag = f"<style>{stoplight_css}</style>"
    else:
        stoplight_js_tag = f'<script src="{STOPLIGHT_JS}"></script>'
        stoplight_css_tag = f'<link rel="stylesheet" href="{STOPLIGHT_CSS}">'

    # The initial element references apiDescriptionUrl="iam.yaml"; swap it for
    # the embedded document so nothing is fetched on first paint.
    head_extra = (
        f"{stoplight_css_tag}\n"
        f"  <style>\n{styles_css}\n  </style>"
    )

    # Compose the <head>: replace the Stoplight CDN <script>/<link> and the
    # external styles.css <link> with our inlined / embedded equivalents.
    html = index_html

    # Remove the original Stoplight JS script tag (we re-add it before app.js).
    html = re.sub(
        r'\s*<script src="https://unpkg\.com/@stoplight/elements/web-components\.min\.js"></script>',
        "",
        html,
    )
    # Replace the Stoplight CSS <link> + external styles.css <link> with inline.
    html = re.sub(
        r'\s*<link rel="stylesheet" href="https://unpkg\.com/@stoplight/elements/styles\.min\.css">',
        "",
        html,
    )
    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        head_extra,
    )

    # Inject, right before </body>:
    #   1. the embedded specs map + the tab list (so app.js builds tabs from it)
    #   2. the Stoplight Elements runtime (must load before app.js runs)
    #   3. the patched app.js
    #
    # app.js builds the tab bar from window.__SPECS_LIST__ and loads the first
    # spec via switchApi(), which the patch redirects to the embedded document.
    bootstrap = """
  <script>
    // Embedded OpenAPI specs (raw YAML strings), keyed by their file name.
    window.__SPECS__ = __SPECS_JSON__;
    // Ordered tab list { file, label }; overrides app.js's DEFAULT_SPECS.
    window.__SPECS_LIST__ = __SPECS_LIST_JSON__;
  </script>
  __STOPLIGHT_JS__
  <script>
__APP_JS__
  </script>
"""
    bootstrap = (
        bootstrap.replace("__SPECS_JSON__", specs_json)
        .replace("__SPECS_LIST_JSON__", specs_list_json)
        .replace("__STOPLIGHT_JS__", stoplight_js_tag)
        .replace("__APP_JS__", patched_app_js)
    )

    # Remove the original external app.js include and inject our bootstrap.
    html = html.replace('<script src="app.js"></script>', "")
    html = html.replace("</body>", bootstrap + "\n</body>")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")

    size_kb = output.stat().st_size / 1024
    print(f"\nDone. Wrote {output} ({size_kb:.1f} KiB)")
    print("Open it directly in a browser (double-click or file://) - no nginx needed.")
    if not offline:
        print("Note: Stoplight Elements assets load from the CDN, so the first")
        print("      open needs internet. Use --offline to embed them too.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=ROOT / "dist" / "iic-api-docs.html",
        help="output HTML path (default: dist/iic-api-docs.html)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="download and inline the Stoplight Elements JS/CSS for full offline use",
    )
    parser.add_argument(
        "--specs-only",
        action="store_true",
        help="only regenerate web/specs.json (for the nginx-served site) and exit",
    )
    args = parser.parse_args()
    if args.specs_only:
        print("Generating web/specs.json ...")
        write_specs_json()
        return
    build(args.output, args.offline)


if __name__ == "__main__":
    main()
