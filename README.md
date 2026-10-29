# Revisions

One sentence at a time. Type, hit Return, type it better. The live line stays centred; everything you've moved past scrolls up, fades, and gets crossed out. Bank the ones that are working, leave a note in the margin, scroll back and restore any of them.

Design source: the Paper file **Revisions**. The build has since moved on from the mocks: pure white ground, mixed-case sentences, red-pen strikes and underlines, black Permanent Marker notes, a yellow highlighter for the word hop, and the sentence column centred.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Everything is saved to `localStorage` in the browser; there is no server.

The app opens on **Drafts**, a dashboard of every draft as a shrunken editor tile: the latest sentence centred, the one before it faded and struck through, a mini rail of dashes down the side. Click a tile to open it, "New draft" (or `N`) to start one, hover a tile for Delete. Inside the editor the "Revisions" crumb goes back, as does `Esc` once there is nothing else to escape from.

## Keys

| Key | While typing | While browsing (↑ from the live line) |
| --- | --- | --- |
| `↵` | Commit this revision, start the next one preloaded with the same words, caret at the start | Restore the browsed sentence as the latest revision |
| `⌘↵` | Commit and start the next one blank | |
| `⌥ ←` `⌥ →` | Hop the highlight a word at a time; typing replaces the highlighted word, releasing ⌥ gives you ordinary arrows again | |
| `⌃⌥ ←` `⌃⌥ →` | Jump the highlight to the first / last word | |
| `Tab` / `⇧Tab` | Across to the note margin / back to the sentence | Edit the note on the browsed line |
| `⌘B` | Bank / unbank the live line | Bank / unbank (bare `B` also works) |
| `⌘⇧B` | View banked | View banked |
Words in the live line that differ from the previous revision are written in the blue pen. Once a line drifts more than halfway from the previous revision it counts as a rewrite and stays unmarked until you commit.
| `↑` `↓` | Browse history (from the first / last visual line of the sentence) | Move between revisions |
| `⌘↑` `⌘↓` | Jump to the very first revision / back to the latest | Same |
| `Esc` | Leave the note | Back to the latest line; in banked-only, back to all revisions |
| `⇧↵` | Soft line break inside the sentence | |

Bank and note are independent: a line can have either, both, or neither. Banked lines are never struck through.

On a phone or tablet (any coarse pointer) the key hints become tappable actions: Bank, Note and View banked while typing; Restore, Latest, Bank and Note while browsing. Tap a past line to browse to it, tap the live line or Latest to come back, and the soft keyboard's Return still commits. The app resizes to the visual viewport so the live line stays centred above the keyboard.

## Mark

The squiggle beside "Drafts" and in the favicon is Frame 33 from the Figma draft "Untitled", exported as SVG into `public/squiggle.svg` and `public/favicon.svg` (the favicon flips to white in dark-mode tabs).

## Fonts

Sentences use Helvetica Neue Condensed Bold when it is installed locally (it is on macOS), otherwise Archivo from Google Fonts pulled in to 75% width. Notes and revision numbers are Permanent Marker; chrome is Inter.

## Deploy

`npm run build:site` builds with `/revisions/` as the base and writes into the `revisions/` folder of the personal-site checkout next to this one (`../backup-jordanmoore.github.io`), which GitHub Pages serves at https://jordanm.co.uk/revisions/. Commit and push that repo to publish.
