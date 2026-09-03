# Changelog


## Unreleased

### UI/UX enhancements and bug fixes

* Fixed the doubled text of highlights in files whose highlight boxes are drawn tall enough to reach the line above: every line but the first was read twice.
* Fixed the paragraphs of highlights on a page set in columns or in blocks of different type. The line spacing a highlight is measured against is now read off the lines of the block it stands in — the same column, set in the same size — rather than off the whole page, which on such a page said its lines stood a fraction as far apart as they do and made a paragraph of every line.
* Fixed the space left before the punctuation after a footnote reference, which came out as `word[^1] .`
* Fixed the loss of annotations sharing a note name. A note the same extraction has already written is added to instead of being overwritten, so two annotations of one topic no longer leave only the last of them.


## 2.1.0

### New features

* **Recognition of footnote marks.** A new setting under the general rules turns the superscript marks of a book — numbers and signs alike — into footnote references, keeping the number the book gave them: `back on reality.[^8]`. The text of the note is not extracted: on the page it stands outside the highlight.

### UI/UX enhancements and bug fixes 

* Fixed the reading order of raised text: a footnote mark no longer moves to the beginning of its line.
* Fixed the reading order of a line whose halves are set a fraction of a point apart.
* Fixed a bug when a subfolder wasn't created automatically from a PDF's bookmark because of the dot in the end of its title.


## 2.0.0

### New features

* **Select colors for extraction.** A new toggle in the advanced extraction menu that allows you to select annotation colors to be extracted. The list of colors is extracted from the file itself.
* **An extraction progress bar.** A progress bar that displays the real progress of extraction with the number of extracted annotations.
* **Automatically reorder headings found in templates or comments.** A new setting under the general rules moves the headings a template or a comment writes, whichever group headings are switched on. The shallowest of them lands one level below the last group heading, and the rest keep their order relative to it.
* **A `{{color}}` template variable.** The color the annotation was marked with, as `#rrggbb`, and empty when the PDF gives none.
* **Substantial paragraph recognition enhancement.** A new setting under the general rules allows you to select, how to separate paragrapghs found in the comments: a blank line, a line break or nothing. Where a paragraph ends is read off the page — the indent of a new line, the space between lines, a line stopping short of the margin.
* **Support for Greek, Hebrew and Arabic text recognition.** SPIonic and SPTiberian are decoded to Unicode, accents and vowel points included. Other such fonts are recognised and left alone rather than run through a table that is not theirs.

### UI/UX enhancements and bug fixes 

* Extraction is 1.2–2x faster now.


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
