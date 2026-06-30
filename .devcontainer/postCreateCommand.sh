#!/bin/sh

mkdir -p ~/.agents/skills

# git clone https://github.com/Zillaforge/skills ~/.agents/skills


if command -v openspec > /dev/null 2>&1; then
  # Configure openspec with all 11 workflows (skills delivery only)
  mkdir -p /root/.config/openspec
  cat > /root/.config/openspec/config.json << 'EOF'
{
  "profile": "custom",
  "delivery": "skills",
  "workflows": [
    "propose", "explore", "new", "continue",
    "apply", "ff", "sync", "archive",
    "bulk-archive", "verify", "onboard"
  ]
}
EOF

  # Install all OpenSpec skills to ~/.agents/skills (without the openspec/ project directory)
  _tmpdir=$(mktemp -d)
  openspec init --profile custom --tools opencode --force "$_tmpdir"
  cp -r "$_tmpdir/.opencode/skills/." ~/.agents/skills/
  rm -rf "$_tmpdir"
fi