#!/usr/bin/env bash
# Build the site and push dist/ to the gh-pages branch (GitHub Pages serves it).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --no-audit --no-fund
npm run build
rev=$(git rev-parse --short HEAD 2>/dev/null || echo local)
tmp=$(mktemp -d)
cp -r dist/. "$tmp/"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "Publish site from ${rev}"
remote=$(git -C "$OLDPWD" remote get-url origin)
git push -f "$remote" gh-pages
echo "Published ${rev} to gh-pages"
