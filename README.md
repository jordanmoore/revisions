# Revisions

One sentence at a time. Type, hit Return, type it better. The live line stays centred; everything you've moved past scrolls up, fades, and gets crossed out. Bank the ones that are working, leave a note in the margin, scroll back and restore any of them.

Design source: the Paper file **Revisions**, and the Figma frame "Untitled" for the ad-copy pass. The build has since moved on from the Paper mocks: pure white ground, red-pen strikes and underlines, black Permanent Marker notes, a yellow highlighter for the word hop, and the sentence column centred. Sentences are set in capitals, centred, in Futura Condensed Bold, so what you type reads like a line of copy; typing starts from the middle of the page and grows outwards.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Everything is saved to `localStorage` in the browser; there is no server.

The app opens on **Drafts**, a dashboard of every draft as a shrunken editor tile: the latest sentence centred, the one before it faded and struck through, a mini rail of dashes down the side. Arrow keys move between tiles, Return opens the selected one, Backspace deletes it (after a confirm), `N` starts a new draft; the mouse works too. Inside the editor the "Revisions" crumb goes back, as does `Esc` once there is nothing else to escape from.

## Keys

| Key | While typing | While browsing (↑ from the live line) |
| --- | --- | --- |
| `↵` | Commit this revision, start the next one preloaded with the same words, caret at the start | Restore the browsed sentence as the latest revision |
| `⌘↵` | Commit and start the next one blank | |
| `⌥ ←` `⌥ →` | Hop the highlight a word at a time; typing replaces the highlighted word, releasing ⌥ gives you ordinary arrows again | |
| `⌃⌥ ←` `⌃⌥ →` | Jump the highlight to the first / last word | |
| `Tab` | Across to the note margin, and back to the sentence | Edit the note on the browsed line |
| `⇧Tab` | Tape the highlighted words to the left margin, or open a blank strip to write on (`⇧Tab` again on the tape adds another, up to five; `↵` or `Esc` comes back; `⌫` on a blank strip peels it off; `←` from the very start of the sentence lands on the top strip too, and `→` off the end of a strip comes back) | Same |
| `⌘⇧L` | Hide or show the tape | Same |
| `⌘B` | Bank / unbank the live line | Bank / unbank (bare `B` also works) |
| `⌘⇧B` | View banked | View banked |
| `⌘⇧D` | Dark or light for this draft, overriding the app setting; its tile on the Drafts page follows | |
| `⌘⇧U` | Original case: show this draft as typed instead of in capitals (and back); its tile and its lines in Every revision follow | Same |
| `↑` `↓` | Browse history (from the first / last visual line of the sentence) | Move between revisions |
| `⌘↑` `⌘↓` | Jump to the very first revision / back to the latest | Same |
| `Esc` | Leave the note | Back to the latest line; in banked-only, back to all revisions |
| `⇧↵` | Soft line break inside the sentence | |

**Tape** is for words you want to keep in sight while you revise. Hop the highlight onto a word or two and `⇧Tab` tapes them to the left of the sentence on a strip of sticky-note yellow, in the marker pen, without moving the caret; with nothing highlighted `⇧Tab` opens a blank strip to write on. A strip holds twenty-four characters and shakes rather than take a twenty-fifth. Up to five strips, staggered and slightly askew, and they stay level with the live line as the draft grows. `⌘⇧L`, the "on tape" count in the top bar, or the command bar hides and shows them; the words are kept with the draft either way. The tape needs a real left margin and a keyboard, so it only appears at desktop widths.

Bank and note are independent: a line can have either, both, or neither. Banked lines are never struck through, and in the timeline rail a banked tick shows its sentence (two lines, 150px) instead of its number, so the rail doubles as a list of keepers.

Words in the live line that differ from the previous revision are written in the blue pen. Once a line drifts more than halfway from the previous revision it counts as a rewrite and stays unmarked until you commit.

Drafts can be gathered into **groups**. The dashboard shows Recents (drafts in no group) first, then each group newest first with a big faded heading you can rename in place. `G` or New group makes one (Esc on a group you have not named or put anything in takes it straight back off); the command bar moves a draft into a group, into a new group, or back out, and can delete a group (its drafts return to Recents). The editor crumb shows the draft's group.

**Every revision** (`#/log`, or the revision count on the Drafts page, or "Every revision" in the command bar) lays out every sentence from every draft as one flowing record: the draft's name, then each revision in order, faded except the banked ones. Click a sentence to open that draft browsing at that revision.

**Capitals** are the default: every sentence is displayed in uppercase, in the editor, on the Drafts tiles, in the rail and in Every revision, whatever case it was typed in. The words underneath keep their case, so `⌘⇧U` (or "Original case" in the command bar) shows a draft as written, and `⌘⇧U` again puts the capitals back. It is remembered per draft.

`⌘K` opens a command bar in either view, in the same style as the Possible Forms palette: type to filter, arrows to choose, Return to run. In the editor it lists every action (new or blank revision, bank, note, view banked, first or latest, dark mode for the draft, as typed or capitals, rename, new draft, back to drafts, open another draft, delete). On the Drafts page it offers new draft, open or delete the selected draft, open any draft by name or its opening words, and dark mode for the app. Any draft row goes deeper: Tab (or →) opens that draft's own actions, so you can open, rename, move between groups or delete a draft you found by searching, without opening it first. Rename turns the bar into a text field (Return saves); Backspace on an empty bar, or Esc, steps back out.

The Drafts page has a moon / sun control for the whole app (it starts from your system preference and is remembered in the browser). A draft can override it from its own top bar; setting a draft back to match the app clears the override.

On a phone or tablet (any coarse pointer) the key hints become tappable actions: Bank, Note and View banked while typing; Restore, Latest, Bank and Note while browsing. Tap a past line to browse to it, tap the live line or Latest to come back, and the soft keyboard's Return still commits. The app resizes to the visual viewport so the live line stays centred above the keyboard.

## Mark

The squiggle beside "Drafts" and in the favicon is Frame 33 from the Figma draft "Untitled", exported as SVG into `public/squiggle.svg` and `public/favicon.svg` (the favicon flips to white in dark-mode tabs).

## Fonts

Sentences are Futura Condensed Bold and the timeline rail and the faint revision numbers Futura Condensed Medium: URW++'s Futura, licensed as a webfont from Font Bros and served from `src/fonts/` through `@font-face` (the licence covers any site Jordan owns, up to a monthly page-view cap, and allows only `@font-face` use). The `.woff` files are not committed; drop them into `src/fonts/` from the Font Bros order before building. Archivo from Google Fonts, pulled in to 75% width at the same weights, stands in while they load or if they are missing. Notes and the tape are Permanent Marker; chrome is Inter.

## Deploy

`npm run build:site` builds with `/revisions/` as the base and writes into the `revisions/` folder of the personal-site checkout next to this one (`../backup-jordanmoore.github.io`), which GitHub Pages serves at https://jordanm.co.uk/revisions/. Commit and push that repo to publish.
