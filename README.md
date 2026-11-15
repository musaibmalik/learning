# learning.1981.codes

A static site built from the "Claude Models Guide" Claude Doc (the Reading page): one page per doc tab, with every diagram rendered as inline SVG, light and dark themes, and a phone layout.

- `content/tabs.json`: the tabs, their order and URL slugs.
- `content/tabs/<tab-id>.html`: each tab, exported from the doc as HTML.
- `content/widgets/<node-id>.jsx`: each diagram's source, read from the doc.
- `assets/`: site CSS and JS.
- `scripts/build.mjs`: turns content into `dist/`.
- `scripts/publish.sh`: builds and pushes `dist/` to the `gh-pages` branch, which GitHub Pages serves at learning.1981.codes.

`main` holds the source. `gh-pages` holds only the built site; don't edit it by hand.

See SYNC.md for how the doc gets re-synced.
