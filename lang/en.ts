// Translated from ru.ts, which is the original — every string here follows the
// Russian one. Change ru.ts first, then sync this file to it.
export default {
    // ─── Plugin ──────────────────────────────────────────────────────────────────
    // Also in manifest.json, which the plugin browser reads and no translation
    // can reach. Change both together.
    PLUGIN_NAME: "Classy PDF Extractor settings",
    PLUGIN_DESCRIPTION: "Import all types of annotations from PDFs inside and outside your vault, with flexible settings and templates.",

    // ─── Commands ────────────────────────────────────────────────────────────────
    COMMAND_EXTRACT_CURRENT_FILE: "Extract annotations from the current file",
    COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION: "Extract annotations from the current file into separate notes",
    COMMAND_EXTRACT_CLIPBOARD_PATH: "Extract annotations from the clipboard path into the current note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE: "Extract annotations from the clipboard path into a new note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION: "Extract annotations from the clipboard path into separate notes",
    COMMAND_EXTRACT_CURRENT_FOLDER: "Extract annotations from every PDF in the current folder",
    COMMAND_EXTRACT_ADVANCED: "Extract annotations with advanced settings",

    // ─── Advanced extraction modal ───────────────────────────────────────────────
    MODAL_ADVANCED_TITLE: "Extraction with advanced settings",
    MODAL_FILE_NAME: "Search for a PDF or paste the path",
    MODAL_FILE_PLACEHOLDER: "Search the vault, or paste the full path if the file is outside it",
    MODAL_PAGES_NAME: "Specify pages for extraction",
    // The field carries no description, so the example is where the shape of an
    // answer is shown: single pages, ranges, roman numerals, all at once.
    MODAL_PAGES_PLACEHOLDER: "For example: 25-50, 55 or i-viii (empty for all pages)",
    MODAL_PAGE_LABELS_NAME: "Look for page labels, not physical pages",
    MODAL_DATES_NAME: "Select dates for extraction",
    MODAL_DATES_DESC: "Shows every day on which the annotations inside the file were created.",
    MODAL_DATES_NONE: "There is nothing to extract from this file.",
    MODAL_COLORS_NAME: "Select colors for extraction",
    // Every reader has a palette of its own — the PDF format defines none — so
    // the list can only be made of the colours this file turns out to hold.
    MODAL_COLORS_DESC: "Shows every annotation color found inside the file.",
    MODAL_COLORS_NONE: "There is nothing to extract from this file.",
    MODAL_COLOR_NONE: "No color",
    MODAL_READING: "Reading the file…",
    MODAL_TARGET_NAME: "Extraction type",
    MODAL_TARGET_CURRENT: "To the current note",
    MODAL_TARGET_SINGLE: "To a new note",
    MODAL_TARGET_SEPARATE: "To separate notes",
    MODAL_EXTRACT: "Extract annotations",
    /**
     * A moment format. `LL` is moment's own long date for the locale, which is
     * "July 25, 2026" here. The days are sorted as `YYYY-MM-DD` whatever this
     * says.
     */
    DATE_FORMAT: "LL",

    // ─── Notices ─────────────────────────────────────────────────────────────────
    // A path reaches these from the clipboard and from the advanced extraction's
    // own field alike, so neither says where it came from.
    NOTICE_PATH_DESKTOP_ONLY: "Reading a PDF from outside the vault is only available in the desktop app.",
    NOTICE_PATH_NOT_A_FILE: "The path that was given is not a file.",
    NOTICE_PATH_NOT_A_FILE_OR_FOLDER: "The path that was given is neither a file nor a folder.",
    NOTICE_PATH_UNREADABLE: "The path that was given could not be read.",
    NOTICE_FOLDER_HAS_NO_PDFS: "There are no PDF files in the folder that was given.",
    NOTICE_FILE_SKIPPED: "This PDF could not be read, so it was skipped",
    NOTICE_EXTRACTION_FAILED: "Could not extract the annotations from this PDF.",
    NOTICE_NOTE_PATH_INVALID: "Could not create the note with the annotations: the vault will not take that path. Check the folder, the subfolder and the note name in the settings.",
    NOTICE_NO_CURRENT_FILE: "Could not create the note with the annotations: no file is open for it to be put beside. Open one, or set a vault folder for the notes.",
    NOTICE_PAGES_UNREADABLE: "Could not read part of the pages that were given",
    NOTICE_NOTHING_SELECTED: "No annotations were found on the selected pages and dates.",
    NOTICE_NO_NOTE_TO_INSERT_INTO: "Could not insert the annotations: no note is open for them to go into. Open one, or extract to a new note.",
    NOTICE_COPIED: "Copied to the clipboard",
    NOTICE_COPY_FAILED: "Could not copy to the clipboard",

    // ─── Progress ────────────────────────────────────────────────────────────────
    // The line above the bar. Whatever is being read is named after the first of
    // these, so it ends without a full stop; the other two stand on their own.
    PROGRESS_EXTRACTING: "Extracting annotations…",
    PROGRESS_READING: "Reading",
    PROGRESS_WRITING: "Writing the notes…",
    PROGRESS_EXTRACTED: "Annotations extracted",

    // ─── Written into exported notes ─────────────────────────────────────────────
    // The {{variables}} are names the formatter resolves; only the words around
    // them may be translated.
    NOTE_NO_ANNOTATIONS: "*No annotations found*",
    NOTE_VAULT_ROOT: "Vault root",
    NOTE_NO_DATE: "No date",
    // The one template every annotation type starts on. `{{highlightedText}}`
    // renders empty for the types that mark up nothing.
    DEFAULT_NOTE_TEMPLATE: "{{highlightedText}}\n\n[p. {{pageLabel}}]\n\n{{body}}\n\n",
    DEFAULT_NOTE_NAME: "Annotations from {{filename}}",
    DEFAULT_ONE_NOTE_NAME: "Annotations from {{filename}}-{{counter}}",
    /** Names a note whose annotation has no comment to take a topic from. */
    NAME_NO_TOPIC: "No topic {{counter}}",

    // ─── Annotation types ────────────────────────────────────────────────────────
    ANNOT_HIGHLIGHT: "Highlighted text",
    ANNOT_UNDERLINE: "Underlined text",
    ANNOT_SQUIGGLY: "Squiggly underline",
    ANNOT_STRIKEOUT: "Struck out text",
    ANNOT_TEXT: "Sticky note comment",
    ANNOT_FREE_TEXT: "Free text on the page",

    // ─── Template variables ──────────────────────────────────────────────────────
    VAR_HIGHLIGHTED_TEXT: "Text highlighted in the PDF",
    VAR_FOLDER: "Folder of the PDF file",
    VAR_FILENAME: "File name of the PDF (without the extension)",
    VAR_FILEPATH: "Path to the PDF file",
    VAR_FILELINK: "A [[wikilink]] for PDFs inside the vault and a file:// path for external ones",
    VAR_PAGE_NUMBER: "Number of the page with the annotation (counted among the physical pages)",
    VAR_PAGE_LABEL: "Label of the page with the annotation (as the author of the document numbered that page)",
    VAR_AUTHOR: "Author of the annotation",
    VAR_BODY: "Text of the comment, if there is one",
    VAR_TYPE: "Annotation type",
    VAR_COLOR: "Color of the annotation, like #ffd400, when the PDF stores colors",
    VAR_TOPIC: "First line of the comment",
    VAR_CREATED: "Day the annotation was created, like 2024-01-15, when the PDF stores dates",
    VAR_CREATED_TIME: "Time the annotation was created, like 14:30, when the PDF stores times",
    VAR_IS_EXTERNAL: "True for PDFs outside the vault, for {{#if isExternal}} in a template",

    // ─── Settings: annotations ───────────────────────────────────────────────────
    SETTING_ANNOTATIONS_NAME: "Select annotation types to be extracted",

    // ─── Settings: templates ─────────────────────────────────────────────────────
    // One sentence, not the pieces either side of the link: the link is woven in
    // by looking for HANDLEBARS_LINK inside it, so this sentence has to contain
    // that word literally.
    SECTION_TEMPLATES: "Import templates",
    SECTION_TEMPLATES_DESC: "Templates set the formatting of the imported annotations. The variables table below lists the available Handlebars syntax: on import those variables are replaced with their corresponding values.",
    HANDLEBARS_LINK: "Handlebars",
    SHOW_VARIABLES_TABLE: "Show the variables table",
    HIDE_VARIABLES_TABLE: "Hide the variables table",
    TABLE_VARIABLE: "Variable (clickable)",
    TABLE_DESCRIPTION: "Description",
    COPY_TOOLTIP: "Copy to the clipboard",
    SETTING_TEMPLATE_NAME: "Formatting template",
    SETTING_TEMPLATE_DESC: "The default template applies to every annotation type whose own template is empty.",
    OPTION_TEMPLATE_DEFAULT: "Default (for all types)",
    PLACEHOLDER_TEMPLATE_DEFAULT: "Empty: this annotation type currently uses the default template.",
    /**
     * Names a variable the type being edited never fills. It hovers over the
     * variable itself where there is a mouse, and stands under the editor
     * where there is none. `{{variable}}` is replaced with its name and
     * `{{type}}` with the type's — only the words around them are translated.
     */
    WARNING_VARIABLE_UNFILLED: "{{variable}} is left empty: “{{type}}” marks up no text in the PDF.",

    // ─── Settings: grouping and headings ─────────────────────────────────────────
    // Each grouping is paired with the heading it heads: a heading is written
    // only where that grouping gathered the annotations under it.
    SETTING_GROUP_BY_FOLDER_NAME: "Group by folder",
    SETTING_GROUP_BY_FOLDER_DESC: "Collects every PDF from the same folder together, and applies only when the annotations come from several folders.",
    SETTING_GROUP_BY_FILE_NAME: "Group by file",
    SETTING_GROUP_BY_FILE_DESC: "Collects every annotation from the same PDF together, and applies only when the annotations come from several files.",
    SETTING_GROUP_BY_DATE_NAME: "Group by creation date",
    SETTING_GROUP_BY_DATE_DESC: "Groups annotations by the day of creation — annotations without a date come last.",
    SETTING_SORT_BY_TOPIC_NAME: "Group by topic",
    SETTING_SORT_BY_TOPIC_DESC: "The first line of each comment is read as its topic: in a shared note the annotations are collected by it, and in an extraction to separate notes it can become the name of a note.",
    SETTING_FOLDER_HEADING_NAME: "Add folder headings",
    SETTING_FOLDER_HEADING_DESC: "Adds a heading to the text with the folder name when annotations are grouped by folder.",
    SETTING_FILE_HEADING_NAME: "Add file headings",
    SETTING_FILE_HEADING_DESC: "Adds a heading to the text with the file name when annotations are grouped by file.",
    SETTING_DATE_HEADING_NAME: "Add date headings",
    SETTING_DATE_HEADING_DESC: "Adds a heading to the text for each date when annotations are grouped by creation date.",
    SETTING_TOPIC_HEADING_NAME: "Collect annotations with the same topic under one heading",
    SETTING_TOPIC_HEADING_DESC: "Adds a heading for each topic and collects the annotations that share it underneath.",

    // ─── Settings: general rules ─────────────────────────────────────────────────
    // Applies to every extraction: where the notes land, what becomes of the
    // tags, and what happens to a note that is already there.
    SECTION_GENERAL_RULES: "General extraction rules",
    SETTING_PARAGRAPHS_NAME: "Separate the paragraphs in highlighted text",
    SETTING_PARAGRAPHS_DESC: "The plugin will attempt to identify paragraph boundaries based on various indicators and separate them as specified.",
    OPTION_PARAGRAPHS_BLANK: "A blank line",
    OPTION_PARAGRAPHS_BREAK: "A line break",
    OPTION_PARAGRAPHS_NONE: "Do not separate",
    SETTING_NOTE_LOCATION_NAME: "Destination for created notes",
    SETTING_NOTE_LOCATION_DESC: "Choose where the created notes will be placed.",
    OPTION_NOTE_LOCATION_CURRENT: "Same folder as the current file",
    OPTION_NOTE_LOCATION_VAULT: "A specified folder in the vault",
    SETTING_NOTE_FOLDER_NAME: "Specify a folder in the vault",
    SETTING_NOTE_FOLDER_DESC: "Start typing to see suggestions, or leave it empty to place them in the vault root.",
    PLACEHOLDER_VAULT_ROOT: "If empty, the notes go to the vault root",
    SETTING_EXTRACT_TAGS_NAME: "Extract tags from annotations into the note properties",
    SETTING_EXTRACT_TAGS_DESC: "Tags found in the annotations are moved automatically into the note properties.",
    OPTION_EXTRACT_TAGS_NEVER: "Never",
    OPTION_EXTRACT_TAGS_ALWAYS: "Always",
    OPTION_EXTRACT_TAGS_SINGLE: "When extracting into a shared note",
    OPTION_EXTRACT_TAGS_SEPARATE: "When extracting into separate notes",
    SETTING_OVERWRITE_NAME: "Allow overwriting",
    SETTING_OVERWRITE_DESC: "If a note with the same name already exists, it is replaced rather than appended to.",

    // ─── Settings: separate notes ────────────────────────────────────────────────
    SECTION_SEPARATE_NOTES: "Extraction to separate notes",
    SETTING_TOPIC_TO_NAME_NAME: "Use the topic of the comment as the note name",
    SETTING_TOPIC_TO_NAME_DESC: "Enable to avoid duplicating {{topic}} when creating separate notes, if your template has it.",
    SETTING_ONE_NOTE_NAME_NAME: "Naming pattern for annotations imported into separate notes",
    SETTING_ONE_NOTE_NAME_DESC: "Use unique variables, such as {{counter}}, or all annotations will end up in the same note.",
    SETTING_NOTE_SUBFOLDER_NAME: "Subfolder (optional)",
    SETTING_NOTE_SUBFOLDER_DESC: "When filled, this naming template creates a subfolder for the separate notes inside the destination that was chosen.",
    // Shows the shape of an answer the field expects: the description above it
    // already says that an empty field creates no subfolder.
    PLACEHOLDER_SUBFOLDER_EXAMPLE: "For example, {{filename}} or another variable with any prefix or suffix",
    SETTING_SECTION_SUBFOLDER_NAME: "Create a subfolder for each section of the PDF",
    SETTING_SECTION_SUBFOLDER_DESC: "Reads the bookmarks of the PDF itself and files each note in the folder of the section its annotation stands in.",

    // ─── Settings: shared notes ──────────────────────────────────────────────────
    SECTION_SHARED_NOTES: "Extraction to shared notes",
    SETTING_NOTE_NAME_NAME: "Naming pattern for annotations imported into a shared note",
    SETTING_NOTE_NAME_DESC: "Use unique variables, such as {{filename}}, or every PDF will write its annotations into the same note.",

};
