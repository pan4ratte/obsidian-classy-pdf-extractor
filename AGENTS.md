# AGENTS.md — classy-pdf-extractor

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Jest (ts-jest) — 302 tests, all passing |
| `npm run lint` / `npm run lint:fix` | ESLint flat config with the official Obsidian ruleset |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |

## Build quirks

- **Two-phase build**: `tsc` (type-check only) then esbuild (bundle to `main.js`).
- `obsidian`, `electron`, `@codemirror/*`, and node builtins (`node:module`'s
  `builtinModules`) are **externed** — not bundled.
- Output `main.js` is **gitignored**; the release workflow ships it with
  `manifest.json` and `styles.css` — those three files are the plugin.
- Plugin entrypoint: `src/main.ts` → default export `PDFAnnotationPlugin`.
- `obsidian` is pinned to exactly `1.13.1` — it matches `minAppVersion` 1.13.0,
  which the declarative settings tab needs. `eslint-plugin-obsidianmd` still
  peer-requires exactly `1.8.7`, so `package.json` overrides that peer to
  `$obsidian`; without the override `npm install` fails with `ERESOLVE`. Drop
  the override once a release of that plugin widens the peer.
- **After changing the `obsidian` version, run `npm ls obsidian` and restart the
  editor's TypeScript server.** Two things go wrong quietly here:
  - `npm install` will not re-resolve a nested copy the lockfile already holds,
    so the plugin's own `node_modules/obsidian` can be left behind at the old
    version. `npm ls` then exits `ELSPROBLEMS` with `invalid:`. Delete the
    nested directory *and* its `package-lock.json` entry, then install again.
  - `noImplicitAny` is **false**, so an `obsidian` that does not resolve is not
    an error — every import from it silently becomes `any`. It surfaces as
    ~90 `no-unsafe-assignment` warnings spread over every file that imports
    from `obsidian`, starting at `lang/helpers.ts:12` and including
    `collapsible.ts` (which needs the global `HTMLElement` augmentation). It
    reads like a code problem and is not one: `tsc` and `npm run lint` from a
    fresh `npm ci` are the check that settles it. An editor that had the
    package swapped underneath it will keep reporting them until its TS server
    is restarted.
  - The same thing on a **whole uninstalled tree** — a CI job or review bot
    that lints without `npm ci` — is the full-blown version: `obsidian`,
    `pdfjs-dist` and `handlebars` all resolve to nothing and ESLint reports
    **~830 warnings across nine files** (`settings.ts` 432,
    `advancedExtractionModal.ts` 184, `main.ts` 135, `extractHighlight.ts` 32,
    `progress.ts` 29, `types.ts` 6, `collapsible.ts` 5, `helpers.ts` 4,
    `formatter.ts` 3), in five `no-unsafe-*` rules — `no-unsafe-call` 374,
    `no-unsafe-member-access` 297, `no-unsafe-assignment` 102,
    `no-unsafe-argument` 33, `no-unsafe-return` 24 — **and 12 errors** on top:
    ten `no-redundant-type-constituents` (every one of them naming an Obsidian
    component as "an 'error' type that acts as 'any'") and two
    `no-unnecessary-type-assertion`, at `settings.ts:558` and
    `loadPDFFile.test.ts:50`. The errors are why lint exits non-zero here
    whether or not `--max-warnings 0` was passed. Not one of them is a source
    defect. `.github/workflows/ci.yml` guards against it with a dependency
    check that fails before the linter ever runs.

    **The counts move with the source — the shape is what identifies it.** Every
    warning is a `no-unsafe-*` on a file that imports from one of those three
    packages, and the errors all name a type that resolved to nothing. Read
    them that way rather than diffing the totals. To check the numbers without
    disturbing the tree, move `node_modules/{obsidian,pdfjs-dist,handlebars}`
    aside, run `npx eslint . -f json`, and move them back — reinstalling to
    reproduce this would rewrite `package-lock.json`, which on Windows is the
    trap described below.
- Both halves of the build target **ES2020** (`target` in `tsconfig.json` and in
  `esbuild.config.mjs`). The Electron behind `minAppVersion` 1.13.0 has all of
  it, so nothing is downlevelled.
- TypeScript is **6.0.3**, one major behind `latest`: `typescript-eslint` caps
  at `<6.1.0` and `ts-jest` at `<7`, so 7.x takes the linter and the tests down
  with it. Three tsconfig entries exist only because of the 6.0 defaults —
  `strict: false` (6 flipped the default on; the code predates it),
  `esModuleInterop: true` (mandatory now, and the reason `moment` needs the cast
  in `advancedExtractionModal.ts`) and `rootDir` (6 will not infer an output
  layout from ts-jest's one-file-at-a-time compiles).
- ESLint is **10.x** but `@eslint/js` stays on **9.x** — it is in
  `devDependencies` only to satisfy `eslint-plugin-obsidianmd`'s `^9.30.1` peer,
  and `eslint.config.mjs` never imports it. Same for `@eslint/json`, pinned to
  the exact `0.14.0` that plugin asks for.

## npm audit

`npm audit` reports **0 vulnerabilities**, on Windows and on Linux. It reported
29 for a while; that was stale advisory metadata, now corrected upstream, not a
change in this tree. **The `overrides` block is what keeps it at zero — do not
"simplify" it.**

- The advisory was [GHSA-mh99-v99m-4gvg][be] (CVE-2026-14257), an
  out-of-memory DoS in `brace-expansion` reachable by feeding it a hostile glob.
  Everything else in the old report was a package depending on it through
  `minimatch`. Nothing reached the plugin anyway: `main.js` bundles only
  `handlebars`, `pdfjs-dist` and this repo's source.
- Every copy of `brace-expansion` in the tree carries the
  `EXPANSION_MAX_LENGTH` guard — `2.1.4` under old `minimatch`, `5.0.9` under
  `minimatch@10`. Verify with `npm ls brace-expansion --all` and read the
  versions; the audit count is the weaker signal.
- The selector is `minimatch@<10` **on purpose, and this is load-bearing**.
  `brace-expansion@5` exports `expand` as a *named* export; `minimatch` 3, 8
  and 9 all want the default one. A blanket `"brace-expansion": "^5.0.9"`
  installs cleanly, passes lint, tests and build, reports zero vulnerabilities —
  and then throws `(0 , brace_expansion_1.default) is not a function` the first
  time anything expands a brace glob. It was committed once and reverted.
  `2.1.x` is the maintenance backport that carries the fix and keeps the
  CommonJS default export.
- Zero is **not** reachable by moving every `minimatch` to `>=10`:
  `eslint-plugin-import@2.32.0` (via `eslint-plugin-obsidianmd`) calls
  `minimatch()` as a function, which `minimatch@10` no longer exports.

[be]: https://github.com/advisories/GHSA-mh99-v99m-4gvg

## package-lock.json is generated on Linux

**Never commit a `package-lock.json` that `npm install` wrote on Windows.** The
Windows resolution is 674 entries; the Linux one is 676. The two extra are
top-level `node_modules/@emnapi/core` and `node_modules/@emnapi/runtime`,
optional transitive dependencies of the native `@unrs/resolver` binding that
`eslint-plugin-import` loads. Windows never resolves them at the top level, so a
lockfile written there is complete locally and short everywhere else:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json ... are in sync.
npm error Missing: @emnapi/core@1.11.3 from lock file
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

Three things make this worse than it sounds, and all three have been hit:

- **The declared dependencies are in sync.** `dependencies` and
  `devDependencies` match the lockfile exactly; only the resolved tree is
  short. Diffing the two files tells you nothing.
- **npm's own advice is a trap here.** The error says to run `npm install` —
  which, run on Windows, regenerates the *broken* lockfile and reverts the fix
  silently, leaving no diff. It only helps on Linux or macOS.
- **It is invisible on Windows.** `npm ci`, lint, tests and build all pass
  there with the short lockfile.

To regenerate, in WSL (Ubuntu 24.04 with a native Node 24 — not the Windows
`node` that `/mnt/c` interop puts on `PATH`):

```bash
cp package.json package-lock.json ~/lockgen/ && cd ~/lockgen
npm install          # rewrites package-lock.json with the hoisted entries
rm -rf node_modules && npm ci    # must succeed
```

then copy `package-lock.json` back. The result still carries the win32, linux
and darwin binaries (8 / 27 / 6 entries), so it works on every platform —
`npm ci` on Windows is the check for that. `ci.yml` verifies the two hoisted
entries are present before installing, so a Windows-written lockfile fails
there with the fix named rather than as npm's "not in sync".

## Testing

- Jest with `ts-jest` preset; `obsidian` module mapped to `test/mocks/obsidian.ts`.
  The mock only stubs what importing the code under test evaluates — extend it
  when a test needs more, rather than faking Obsidian behaviour.
- `ANNOTS_TREATED_AS_HIGHLIGHTS` is mocked in `extractHighlight.test.ts`.
- Run `npm test` (no watch by default).
- `loadPDFFile.test.ts` drives the pipeline through a hand-rolled pdf.js stub
  cast to `PDFJsLib`; that interface is small on purpose so this stays possible.
  The stub also answers `getOutline`, `getDestination` and `getPageIndex`, which
  is what the section tests drive — a destination there is
  `[pageRef, {name}, ...arguments]`, exactly as pdf.js reports one.
- The glyph fixtures are real pdf.js text items and real PDF highlight rectangles for
  the words `diese`, `(S. 1)`, `Word,` and `Lesen`. The single-character cases
  (`W`, `o`, `r`, `d`, `,` of `Word,`) are what pin down the glyph-width
  estimation in `glyphBorders` — if you retune `WIDE_LETTER_WEIGHT` or
  `SLIM_LETTER_WEIGHT`, those are the tests that will tell you.
- The script fixtures are hand-built instead, with round widths so the borders
  fall on whole numbers and the expected slice can be read off the quad. The
  Greek one is **decomposed on purpose** — `α` plus a combining accent, not the
  precomposed `ά` — and an editor or a tool that normalises it to NFC silently
  turns the test into one that passes either way.

## Paragraphs

A PDF holds no paragraphs — only lines laid out on a page — so `paragraphBreaks`
reads them off the shape of the quads: the **gap** between two lines, the
**indent** of the second, and whether the first **stops short** of the margin.
The tuning constants sit above it. Four things about it are load-bearing:

- **The indent is measured against the line above, not against the leftmost
  line of the highlight.** Every line of an indented quotation stands in from
  the body's margin; only its first one begins anything. Measured against the
  block's own left edge, a quotation comes out one paragraph per line.
- **The short line never breaks a paragraph on its own** — it confirms the
  other two. A last line stopping short is also just where the words ran out,
  and a one-line quotation is short as well. This is what keeps ragged-right
  text in one piece.
- **Gaps are measured between the lines' bottoms**, not their tops: a footnote
  marker is a quad of its own raised above the line it belongs to, it joins that
  line, and it lifts its top. The tops are also what `linesOfQuads` gathered the
  lines by in the first place.
- **The spacing compared against is the smallest gap the highlight has**, which
  is the spacing of whatever block the lines stand in rather than the page's.
  `pageLinePitch` covers the two cases that leaves: a highlight of two lines has
  one gap and nothing to compare it with, and a highlight whose every line is a
  paragraph would take the space between paragraphs for the space between lines.
  It is read once per page in `readingOrderText` and travels on `PageText`.

The geometry comes from the annotation's own quads and never from the page's
text. A quad covers a whole line except on the first and last lines of a
highlight, and being short there can only *suppress* a break, never invent one —
which is the safe direction. Reading the line's real extent off the page's items
would need column detection to go with it.

`extractHighlight` writes the paragraphs `PARAGRAPH_BREAK` apart and the
formatter decides what a note shows: `separateParagraphs` turns them into a
blank line, a line break or a space, per `paragraphSeparation`. The extraction
is not switched off by that setting — `"none"` restores the text the extraction
used to return, and nothing else.

Tuned against the two annotated books in `Classy PDF Extractor/`: of the 892
highlights in the Cavanaugh, 38 split, every one of them at a real paragraph
(seven of those on the indent alone, in body text set with no extra leading),
and no highlight of the other two files splits at all.

## Scripts other than Latin

`extractHighlight.ts` is the only file that knows about writing systems; note
names, tags, topics and templates are already script-agnostic. Three things
there are not about Latin, and all three are what "Greek/Hebrew/Arabic came out
wrong" turns out to be:

- **A character can take no width.** `letterWeight` answers 0 for `\p{Mn}`,
  `\p{Me}`, `\p{Cf}` and the low half of a surrogate pair. `glyphBorders` shares
  one pdf.js item width out character by character, so a Greek accent, a Hebrew
  vowel point or an Arabic haraka counted as a character of its own moves every
  border after it — a fully pointed Hebrew word is more mark than letter.
- **A span never opens on a zero-width character and never closes before one.**
  The border either side of one is the same x, so which side the snap lands on
  is a coin toss; `glyphSlice` settles it by giving the mark to the letter it is
  written over.
- **pdf.js hands every string over in writing order**, `dir` being the only
  thing that says which end of the item its first character sits at. For an
  `rtl` item, `rightToLeftOrder` maps glyph position back to string index —
  the string turned round, with each run of left-to-right characters turned back
  so a year or a Latin citation reads forwards. The same direction then decides
  which end of the line its items and its quads are taken from, and it is read
  off the text itself when a caller reports no `dir`.

## Pre-Unicode fonts

`src/legacyFonts.ts` reads the fonts that scholarly books typeset their Greek
and Hebrew in before Unicode. They draw an ancient-language glyph at a Latin
byte position and carry **no `/ToUnicode`**, so every reader extracts Latin:
ἁλληλουϊά comes out as `a(llhloui+a&`. Four things about it are not obvious:

- **The font's name is the only evidence.** Nothing else in the file marks the
  text, and it arrives as ordinary ASCII. The name is not in `getTextContent()`
  either — only in `getOperatorList()`, a second parse of the page. It is built
  for a page carrying a markup annotation, and `commonObjs` is the *document's*
  store, so `fontNamesOfPage` checks `has()` first and a book normally pays once
  rather than once a page. Measured on a 500-page book: the render list roughly
  doubles a page's cost, ~5 ms → ~13 ms, for the pages that pay.
- **Decode after slicing, never before.** The glyph borders are per byte, so the
  raw bytes are what the quad is measured against; decoding changes both the
  length and the characters. `searchQuad` slices, then decodes.
- **The accents are zero-advance and the extraction must know.** `encoding.marks`
  feeds `byteWidth` and `takesNoRoom`, which is the same treatment Unicode
  combining marks get. `byteWidth` also weighs a byte as *what it draws* — `l`
  in SPIonic is λ, and the Latin table's 0.6 for a slim `l` would be wrong.
- **Hebrew is written in visual order and turned round a letter at a time.** The
  points follow their consonant in the bytes and must follow it in Unicode too,
  so `decodeLegacyText` gathers each consonant with its own points and reverses
  the *letters*. Reversing the bytes puts every vowel under the wrong consonant.
  Greek instead composes: the marks are combining characters and `normalize("NFC")`
  turns α + psili + oxia into ἄ, so no precomposed table is needed.

Only **SPIonic** and **SPTiberian** have tables, and every entry in them is
confirmed against a real book — `xoi=nic` is χοῖνιξ where the English beside it
reads "choinix", `rsq Nwrn` is נרון קסר, `ryciqf` is קָצִיר. The test files carry
those strings as fixtures; they are the regression net for any table edit.

`RECOGNISED_WITHOUT_A_TABLE` is the deliberate gap. The Linguist's Software
fonts (Graeca, Hebraica, SuperGreek, SuperHebrew) shipped with **different byte
arrangements on Macintosh and Windows** and no published table for either is
reachable; the one BibleWorks table that could be found contradicts itself over
the vowels. Their text is handed back untouched. **Do not fill these in from a
plausible-looking chart** — a wrong table reads as real words, so nothing about
the result looks wrong, which is worse than the gibberish it replaces. Adding a
verified encoding is one entry in `ENCODINGS` and nothing else.

A limitation worth knowing: reconstructing reading order from a *visual*-order
line is ambiguous where punctuation meets a direction change. `X, [Hebrew]` and
`X [Hebrew],` are laid out identically on the page, so a comma between Latin and
Hebrew can land on the wrong side. Nothing in the file distinguishes them.

The glyph weights for these scripts are a much weaker claim than the Latin ones:
there are no highlight rectangles behind them, only the shapes of the letters,
so only the unmistakable ones are listed (Greek capitals and iota; the Hebrew
letters written as one stroke; alef, hamza and the four wide Arabic letters that
keep their width in every joining form). Everything else stays at the average
deliberately — a wrong weight reads worse than no weight.

## Annotation types

`SUPPORTED_ANNOTS` in `src/settings.ts` is the single list of what can be
extracted. The bar for being on it is **carrying text a markdown note can show**:
either PDF text the annotation marks up, or text the reader typed.

pdf.js reports `titleObj`/`contentsObj` for every `MarkupAnnotation` subclass, so
`Ink`, `Square`, `Circle`, `Line`, `Polygon`, `PolyLine`, `Stamp`, `Caret` and
`FileAttachment` are technically readable — they are left out on purpose, because
their content is a drawing, stamp or attached file and their `Contents` is empty
unless a comment happens to be attached, so extracting them produces blank
entries. Don't add them back without a story for what the note would contain.

Two flags drive everything else, so nothing needs updating in parallel:

- `marksUpText` — the four subtypes carrying `QuadPoints` (`Highlight`,
  `Underline`, `Squiggly`, `StrikeOut`, matching pdf.js's own
  `overlaysTextContent`). `ANNOTS_TREATED_AS_HIGHLIGHTS` is derived from it, and
  it decides whether the PDF text underneath is extracted.
- `desiredByDefault` — derives `DEFAULT_DESIRED_ANNOTATIONS`.

The settings tab renders one checkbox per entry, labelled with `description`, so
adding a subtype is a one-line change. `desiredAnnotations` is persisted as a
list of subtype strings.

## Templates

One per annotation type over a `defaultTemplate` that covers the types with
none of their own; a blank entry means "use the default". **Every type starts
blank**, so `DEFAULT_NOTE_TEMPLATE` in the locale is the only template a fresh
install has — it carries a `{{highlightedText}}` that simply renders empty for
the types marking up nothing. Don't reintroduce a second shipped template.

Location is a template variable, not a setting — `{{filelink}}` renders
`[[path]]` inside the vault and the bare `file://` path outside it, and
`{{isExternal}}` is exposed for templates that need more than the link to
differ. `isExternalFile` reaches the formatter from the command: true only for
the clipboard path commands.

## Settings loading

The fork changed the plugin id, so it always starts from a fresh `data.json` and
carries **no migrations** — don't add any for versions of the ancestor plugin.
`loadSettings` copies every declared field, then runs the `normalize*` statics in
`PDFAnnotationPluginSetting` over the ones with a closed set of values. Those
exist for a hand-edited `data.json` and for types added in later versions, not
for upgrades: anything unrecognised falls back to the default.

## Settings tab

Declared through Obsidian 1.13's `getSettingDefinitions()`. `display()` is gone:
a non-empty array of definitions renders the tab **instead of** it, and
`minAppVersion` is 1.13.0, so nothing reaches it.

The array is one group holding one definition per section of the tab —
header, annotation types, templates, general rules, separate notes, shared
notes — and it never changes shape. The last three are the extraction's own
settings, split by what they apply to: every extraction, the one writing a note
per annotation, and the one writing a note per PDF. The render methods are kept
in the same order as the array, so the file reads in the order the tab does.

Each grouping is drawn next to the heading it heads, by `renderGroupingPair`,
which greys the heading out while the grouping is off and remembers the choice
it was switched off from. The pair decides which section both of them live in,
and `formatter.ts` is what settles that: the folder, file and date headings are
skipped for a note holding a single annotation (`onePerNote`), so those three
pairs are shared-notes settings, while the topic pair is written for either kind
and is a general rule. Nothing here spans sections any more — the toggle is a
local of the call that draws the pair, and the tab keeps no fields. Five rules keep it working; each one is a silent failure if
broken:

- **No `control`.** Nothing in this tab is a control the API describes, so every
  definition uses `render` and draws itself. `render` does **not** auto-save:
  every change handler calls `saveSettings()` itself.
- **Build into `setting.settingEl`, never `group.listEl`.** After each pass
  Obsidian prunes the group's list down to the rows it created itself, so
  anything put there is drawn and deleted in the same tick — a blank tab, no
  console error.
- **Reuse the root.** `update()` runs the callback again on the row it already
  drew; appending a fresh root each time puts the whole UI on screen twice. The
  `section()` helper looks the root up before creating it.
- **Redraw your own root, not the definition list.** Obsidian reconciles rows by
  a key taken from the definition's name, so the list stays static and a section
  that has to change redraws into the root it already owns.
- **Fill in `name`, `desc` and `aliases`.** The settings search indexes the
  definition, not the DOM, and a hit scrolls to the row the section is drawn in.
  Each section names the settings inside it in `aliases`, taken from `t` so
  nothing new needs translating. Adding a setting means adding its name there.

The stylesheet carries the other half of this — see the reset at the top of
`styles.css` and the file-order rule on it.

## Source layout (flat, not a monorepo)

```
src/
  main.ts                     — Plugin class, 7 commands, settings load/save
  extractHighlight.ts         — PDF text extraction via pdfjs-dist
  legacyFonts.ts              — the pre-Unicode Greek and Hebrew font tables
  formatter.ts                — Handlebars template rendering
  settings.ts                 — Settings class + settings tab UI
  advancedExtractionModal.ts  — the "advanced settings" modal
  extractionFilter.ts         — page expressions and the page/date/colour/type filter
  collapsible.ts              — the show/hide animation, shared by tab and modal
  progress.ts                 — the notice an extraction runs behind
  types.ts                    — PDFFile, annotation and pdf.js boundary types
lang/
  ru.ts               — every user-facing string; the original
  en.ts               — the same keys, in the same order, translated from ru.ts
  helpers.ts          — picks the locale, exports `t`
test/
  extractHighlight.test.ts  — glyph-level text extraction
  loadPDFFile.test.ts       — extraction pipeline, against a fake pdf.js
  formatter.test.ts         — template variables and template selection
  settings.test.ts          — annotation types, checkbox round-trip
  extractionFilter.test.ts  — page expressions, days, filtering
  legacyFonts.test.ts       — the pre-Unicode tables, against real book strings
  mocks/obsidian.ts
styles.css            — settings tab CSS (release asset)
CHANGELOG.md          — release notes source for the workflow
versions.json         — plugin version → the minAppVersion it shipped with
```

## Release

`manifest.json` is the source of truth. `.github/workflows/main.yml` releases
automatically when its `version` changes on the release branch — **no manual
tagging and no `npm version`**; the release creates the tag.

To cut a release, in one commit:

1. Bump `version` in **`manifest.json` and `package.json`** to the same value —
   the workflow fails the run if they disagree
2. Rename `## Unreleased` in `CHANGELOG.md` to that version — the workflow greps
   `## <version>` for the release notes, so a missing section means an empty
   release body
3. Add the new version to `versions.json`, mapped to the `minAppVersion` this
   release ships with — that file is what lets an older Obsidian keep offering
   the last release it can actually run. It is read from the repository, not
   from the release assets, so it only has to be committed. It covers this
   plugin's own releases only: the history before `1.0.0` belongs to the plugin
   this one was forked from, under a different id
4. Push

The workflow then runs `npm ci` and `npm run build`, attests build provenance for
`main.js` / `manifest.json` / `styles.css`, creates the release with those three
assets, and verifies the attestations. It skips if that version is already
released, so unrelated `manifest.json` edits are harmless.

The release workflow itself does not run lint or tests — `.github/workflows/ci.yml`
does, on every push and pull request, with `--max-warnings 0`. Still run
`npm run lint` and `npm test` before pushing; CI is the backstop, not the
first look.

## Style

- `.editorconfig`: tabs, indent 4, UTF-8, final newline.
- `eslint.config.mjs` (flat config) extends `eslint-plugin-obsidianmd`'s
  `recommended`, which bundles `eslint:recommended`, typescript-eslint
  `recommended-type-checked`, `import`, `depend` and `no-unsanitized`.
- Lint is **clean**: 0 errors and 0 warnings. Keep it that way.
- Every component carries a `then()` for chaining, which
  `@typescript-eslint/no-misused-promises` reads as a promise. Never test one
  for truth — compare it with `null`, or the rule fails the build.
- pdf.js data is typed at the boundary, not passed around as `any`:
  `RawPDFAnnotation` (what pdf.js reports), `PDFAnnotation` (once extraction has
  filled in the note's fields), `RawPDFOutlineItem`, `PDFSection`,
  `PositionedText` and `PDFJsLib` in `src/types.ts`. `loadPdfJs()`,
  `getAnnotations()` and `getOutline()` return `any` — cast once, there.
  `getOutline()` is typed as an array and answers **null** for a document with
  no outline, which is most of them; the cast says so.
- Local overrides in `eslint.config.mjs`: `no-unused-vars` on (args: none),
  `ban-ts-comment` off, `no-explicit-any` autofix disabled (its `fixToUnknown`
  fixer rewrites `any` to `unknown` and breaks every call site).
- No inline UI styles — put CSS in `styles.css` and add a class.
- Settings UI: headings via `new Setting(el).setName(...).setHeading()`, sentence
  case for all user-facing text, no plugin name in command names. A new setting
  goes into the section renderer it belongs to and its name goes into that
  section's `aliases` — see **Settings tab**.
- No CSS rule that re-asserts a settings row of this plugin's own may be added
  above the reset at the top of `styles.css`: they tie with it at 0,3,0, so file
  order is the only thing settling them.
- **No string literals in the UI** — command names, notices, setting names and
  descriptions, the settings header, and the default templates and export names
  (they end up in exported notes) all come from `lang/en.ts`, reached as
  `t.SOME_KEY` via `import { t } from "lang/helpers"`. Flat `UPPER_SNAKE` keys
  grouped under `// ─── Section ───` banners; values are plain strings, and
  anything variable is interpolated at the call site
  (`` new Notice(`${t.NOTICE_COPIED}: ${variable}`) ``). A new language is a
  copy of `en.ts` listed in `helpers.ts`'s `localeMap`. Every locale file must
  carry all of `en.ts`'s keys, since `t` is typed as `typeof en`.
- **`ru.ts` is the original; `en.ts` is translated from it.** New or reworded UI
  text goes into `ru.ts` first and `en.ts` is synced to match in the same
  change — never the reverse. Three kinds of value are not free prose in any
  locale: `HANDLEBARS_LINK` must appear verbatim inside that file's
  `SECTION_TEMPLATES_DESC` for the link to be woven in, `DATE_FORMAT` is a
  moment format string (`ru` uses `D MMMM YYYY`, since moment's `LL` adds a
  "г." that suits prose and not a list), and `DEFAULT_*_TEMPLATE`,
  `DEFAULT_NOTE_NAME` and `NAME_NO_TOPIC` may only have the words around their
  `{{variables}}` translated.
  Exempt, and to stay exempt: the annotation subtypes (spelled as the PDF format
  spells them), the `{{variable}}` names, the command IDs (persisted, so hotkeys
  survive), and the markdown and YAML syntax the formatter writes.
- `PLUGIN_NAME`/`PLUGIN_DESCRIPTION` duplicate `manifest.json`, which the plugin
  browser reads and no translation can reach. Change both together.
- The lint config uses `obsidianmd.configs.recommendedWithLocalesEn`, which
  sentence-case checks every string in `lang/en.ts` and **bans the disable
  comment** for that rule — there is no exempting a string, so write UI text
  that passes. Two consequences worth knowing before adding a string:
  - Write each one as a **single literal**. The rule walks object properties and
    skips `"a" + "b"`, so a concatenated string is silently unchecked.
  - No sentence fragments. Text that wraps a link is one whole sentence rendered
    by `appendTextWithLink`, and a message that varies by case gets one complete
    sentence per case (see `notices.templatesCollapsed`) rather than a word
    spliced into a shared one.
  - Proper nouns go in the rule's `ignoreWords` in `eslint.config.mjs`, which is
    where `Handlebars` and the annotation subtypes live.
