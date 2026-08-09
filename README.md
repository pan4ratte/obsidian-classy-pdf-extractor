<p align="center">
  <img alt="header" src="https://shieldcn.dev/header/graph.svg?title=Classy+PDF+Extractor&amp;subtitle=Import+all+types+of+annotations+to+your+vault&amp;size=wide&amp;mode=dark" />
</p>

<p align="center">
  English | <a href="https://github.com/pan4ratte/obsidian-classy-pdf-extractor/blob/main/README_RU.md">Русский</a>
</p>

This plugin extracts all types of annotations from PDFs and writes them into the notes of your vault with automated formatting. The import offers a choice of annotation types, page ranges and the days the comments were created on, while templates let you format every type separately. Group the annotations by folder, file, date and topic, and send them to the current note, to a new one, or every annotation into a note of its own.


## Features

### 1. Extract annotations from PDFs inside and outside the vault

Extract highlighted, underlined and struck out text and squiggly underlines, as well as sticky note comments and free text on the page, from your PDFs. Import sources: the file you are reading, every PDF in the current folder, and a path in the clipboard — for those PDFs you would rather not copy into the vault. A clipboard path may name a folder as well: every PDF in it is then read, each into its own note.

### 2. Advanced extraction menu for fine-tuned import

Already extracted the annotations from a PDF, then made new ones and want to import only those? Open the advanced menu and narrow the extraction down to certain pages (`25-50`, `25, 26, 30`, `i-viii`), to certain days on which the annotations were created — and to the colors they were marked with. The list of colors is made from the file itself: the PDF format defines no palette, and every reader app uses its own.

### 3. Formatting templates for every annotation type

Set up the default template that will format all annotation types, or create separate templates for specific types. Empty a template — and that annotation type goes back to using the default one. A table of the available variables sits right above the editor for your convenience. Finally, the tags contained in your annotations can be moved into the note's `tags` property automatically, to save you time.

### 4. Grouping, headings and note naming rules

Group the annotations by folder, by file, by the day they were created and by topic (the first line of each comment) — the groupings nest in that order. Grouping by folder and by file applies only when the annotations come from several folders or files. Group headings can optionally be added to the notes automatically. The headings your own templates and comments write can be nested under those group headings: the topmost of them then stands directly under the last group heading, they keep their order relative to one another — and the structure of the note comes out right whichever group headings are switched on. Notes can be named from a template — and, on an extraction into separate notes, after the annotation's own topic; the subfolder for those notes is set in the same place and is also created from a template. An extraction into separate notes can also file them by the PDF's own sections, turning the document's bookmarks into nested folders. The settings are split by the kind of extraction they apply to: general rules, extraction to separate notes, and extraction to shared notes.


## Installation

### Option 1: Obsidian plugin store

1. In Obsidian settings open the tab "Community plugins" and click "Browse" button.

2. In the search bar type `Classy PDF Extractor`, click on the result, then "Install" and "Enable" buttons.

Alternatively, you can install the plugin by following the link to the community website: [https://community.obsidian.md/plugins/classy-pdf-extractor](https://community.obsidian.md/plugins/classy-pdf-extractor)

### Option 2: BRAT plugin

If you want to test beta-versions of the plugin or use previous versions, you can do that with `BRAT` plugin:

1. Install `BRAT` plugin from the official Obsidian plugin store.

2. In the `BRAT` settings, find the “Beta plugin list” section and click on the “Add beta plugin” button.

3. In the window that appears, paste the link to the `Classy PDF Extractor` plugin repository: [https://github.com/pan4ratte/obsidian-classy-pdf-extractor](https://github.com/pan4ratte/obsidian-classy-pdf-extractor)

4. Under “Select a version” choose the desired version and click the “Add plugin” button. The plugin will be automatically installed and will be ready to use.


## About the Author

My name is Mark Ingrem, I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach the subject "Information Technologies in Scientific Research", a unique course that I developed myself from scratch. This plugin helps me in my studies and I use it in my teaching, as well as other plugins that I develop and that you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student that came across this page!


## Credits

The plugin started as a fork of [Extract PDF Annotations](https://github.com/munach/obsidian-extract-pdf-annotations) by Franz Achermann and Florian Stöckl, which in turn built on ideas from Alexis Rondeau's [plugin](https://github.com/akaalias/obsidian-extract-pdf-highlights). Nothing but the idea is left of it: almost everything has been rewritten, fixed, extended and redesigned. Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).
