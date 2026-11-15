# Syncing the doc to the site

The doc lives in Claude Docs (doc id `a06f57ef-e918-464f-9363-112b52759502`). Exporting it needs a
Claude session with the Docs connector, so the sync runs as a Claude routine, not a GitHub Action.

## Steps for the routine (or for "update the learning site")

1. Read the doc (`read` with ref `{object: "project", id: <doc id>}`) to list its tabs.
   - If a tab was added, renamed, reordered or removed, update `content/tabs.json`
     (keep existing slugs so links don't break; new tabs get a short kebab-case slug).
2. For each tab, `export` it with `format: "html"` and `file: <tab id>`, then save it with
   `python3 scripts/save-export.py tab <tab-id> <saved tool result>`.
   Never retype base64 by hand.
3. Run `node scripts/widgets-needed.mjs`. For each id under `missing`, and for every existing
   widget whose tab changed, `read` the node (`ref {object: "node", id}`) and save it with
   `python3 scripts/save-export.py widget <node-id> <saved tool result>`. Delete files listed
   under `unused`.
4. `npm install && npm run build`. The build prints the page and diagram count, and flags
   any diagram it couldn't find.
5. If `git status` shows changes under `content/`, commit them to `main` and run
   `scripts/publish.sh`. If nothing changed, stop: no commit, no publish.

The routine only reads the doc. It never edits it.

## What gets cleaned up on the way

- People mentions in the doc are removed from the public pages.
- Date chips become readable dates; the date under each title shows as "Updated".
- Tables scroll sideways on phones; diagrams scroll with a hint.
