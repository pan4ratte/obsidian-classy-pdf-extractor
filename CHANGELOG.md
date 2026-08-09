# Changelog


## Unreleased

### New features

* **Select colors for extraction.** A new toggle in the advanced extraction menu, under the dates, opens the list of annotation colors the PDF turns out to hold — a swatch and its hex value per checkbox — and the extraction keeps only the ones left ticked. The list is made from the file rather than from a palette: the PDF format defines no standard colors, so every reader app writes its own. The window now narrows in one direction — the annotation types rule the dates, and the two of them rule the colors. An entry the choices before it have left nothing in is greyed out, unticked and cannot be ticked, and comes back as it was when it fills again.
* **A progress bar while an extraction runs.** One notice for the whole run, saying what is being done over a bar that fills by pages, by PDFs or by notes written. It ends by saying how many annotations came out.
* **A `{{color}}` template variable.** The color the annotation was marked with, as `#rrggbb`, so a template can write it out or branch on whether there is one at all. Empty for an annotation the PDF gives no color.

### New features

* **A highlight over two paragraphs comes out as two.** Where a paragraph ends is read off the page: the indent of a new first line, a last line stopping short of the margin, and the space between the lines. A quotation set in from the margin is a paragraph of its own, and so is the body resuming after it. A new setting under the general rules chooses what the paragraphs are written apart with — a blank line, a line break, or nothing at all for a template that needs the text to stay one paragraph.
* **Greek and Hebrew set in pre-Unicode fonts are read.** Scholarly books typeset before Unicode set their ancient languages in fonts that draw a Greek or Hebrew letter at a Latin byte position, and they carry nothing saying so — highlight ἁλληλουϊά in one and every reader, this plugin included, hands back `a(llhloui+a&`. The extraction now recognises the font and decodes it, accents and vowel points included, turning a Hebrew word back round on the way. **SPIonic** and **SPTiberian**, the Scholars Press Greek and Hebrew, are the two it can read. Others are recognised and left alone rather than run through a table that is not theirs.

### Bug fixes

* **Greek, Hebrew and Arabic are read correctly.** Accents, vowel points and harakat are drawn over a letter rather than beside it, and counting them as letters of their own put every glyph of the word after the first one in the wrong place — a marked Greek word came out as a stretch of the letters next to it, and one that did come out lost its accents or opened on somebody else's. Hebrew and Arabic are also read from the right-hand end of the line now, so a highlight over several words no longer comes out with the words back to front. A number or a Latin word inside them keeps its own order.

### Performance

* **Extraction is 1.2–2x faster.** A page is only read for text when something on it marks text up, so a long PDF with few annotations gains most. Highlights, bookmarks and sections are resolved with less work too.


## 1.2.0

### New features

* **Create subfolders for each section of the PDF.** Applies on an extraction into separate notes, reads the document's own bookmarks and files each note under the heading its annotation stands in. The bookmarks nest, and so do the folders: a note from "Second trial" inside "Results" lands in `Results/Second trial`.
* **Extract from PDFs in a folder in the clipboard.** Now all clipboard commands take a folder path as well as a file path: into the current note they arrive as one insertion, and into new notes as a note per PDF — the note name is a template over the file it was read from.
* **Grouping by file.** A new setting gathers every annotation of the same PDF together, on by default. Switched off, annotations from several PDFs are read page by page across all of them.

### UI/UX enhancements and bug fixes 

* Options in the settings were split and regrouped for better logic and clarity for the user.
* The groupings nesting was reordered: now its folder - file - creation date - topic.
* Grouping by folder and by file applies only to an extraction that spans several of them.


## 1.1.0

### Settings could be searched now

* **Requires Obsidian 1.13.0.** The settings tab is now declared through the API that version introduced. Earlier releases stay available to earlier versions of Obsidian.
* **The settings are searchable.** Every section of the tab is indexed — its name, its description, the settings inside it and the template variables — so searching Obsidian's settings for a folder, a tag rule or `{{topic}}` lands on the section that holds it.


## 1.0.0

### Initial release

* **Every annotation type.** Highlights, underlines, squiggly and struck out text bring the PDF text beneath them; sticky notes and free text bring what you typed. Pick the types from a grid of checkboxes.
* **PDFs inside and outside the vault.** Extract from the file you are reading, from every PDF in the current folder, or from a path in the clipboard.
* **Extraction with advanced settings.** One command opens a window that asks what to extract: the annotation types, the PDF, the pages, the days and where the notes go.
* **Pages by range or by label.** Type `25-50`, `25, 26, 30` or `i-viii`, read either as physical pages or as the labels the author gave them.
* **Extract only certain days.** Every day the file's annotations were made on is listed and can be left out. Undated annotations are their own entry.
* **A template for every annotation type.** The default template writes every type, and any type given a template of its own is written with that instead.
* **Fourteen template variables.** `{{highlightedText}}`, `{{body}}`, `{{topic}}`, `{{type}}`, `{{created}}`, `{{createdTime}}`, `{{author}}`, `{{pageNumber}}`, `{{pageLabel}}`, `{{filename}}`, `{{filepath}}`, `{{folder}}`, `{{filelink}}` and `{{isExternal}}`, listed in a table that copies them on click.
* **A warning before the hole appears.** A template asking a type for something it never carries — `{{highlightedText}}` on a sticky note — marks the variable in the editor and says why on hover.
* **Notes where you want them.** Into the note being edited, into a new note, or into a note per annotation. The subfolder takes a template, so `{{filename}}` gives every PDF a folder of its own.
* **Note names from a template or from the topic.** A note per annotation can be named after its comment's first line, which is then left out of the note.
* **Grouping by topic, date and folder.** Each independent of the others, with a separate choice of what gets a heading. Heading levels follow what encloses what, so the outline pane reads the note correctly.
* **Tags into note properties.** Tags written in your comments move into the note's `tags` property, in any script. Choose never, always, extractions into one note, or extractions into separate notes.
* **English and Russian interface.** The plugin follows Obsidian's own language and falls back to English. Dates and the default templates are translated too.
