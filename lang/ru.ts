export default {
    // ─── Plugin ──────────────────────────────────────────────────────────────────
    // The name is the plugin's own and is left as manifest.json spells it, which
    // no translation can reach anyway.
    PLUGIN_NAME: "Настройки Classy PDF Extractor",
    PLUGIN_DESCRIPTION: "Импорт всех типов аннотаций из PDF внутри и вне вашего хранилища с гибкими настройками и шаблонами.",

    // ─── Commands ────────────────────────────────────────────────────────────────
    COMMAND_EXTRACT_CURRENT_FILE: "Извлечь аннотации из текущего файла",
    COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION: "Извлечь аннотации из текущего файла в отдельные заметки",
    COMMAND_EXTRACT_CLIPBOARD_PATH: "Извлечь аннотации по пути из буфера обмена в текущую заметку",
    COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE: "Извлечь аннотации по пути из буфера обмена в новую заметку",
    COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION: "Извлечь аннотации по пути из буфера обмена в отдельные заметки",
    COMMAND_EXTRACT_CURRENT_FOLDER: "Извлечь аннотации из всех PDF в текущей папке",
    COMMAND_EXTRACT_ADVANCED: "Извлечь аннотации с расширенными настройками",

    // ─── Advanced extraction modal ───────────────────────────────────────────────
    MODAL_ADVANCED_TITLE: "Извлечение с расширенными настройками",
    MODAL_FILE_NAME: "Найдите PDF или вставьте путь",
    MODAL_FILE_PLACEHOLDER: "Поиск по хранилищу или полный путь, если файл вне его",
    MODAL_PAGES_NAME: "Укажите страницы для извлечения",
    // The field carries no description, so the example is where the shape of an
    // answer is shown: single pages, ranges, roman numerals, all at once.
    MODAL_PAGES_PLACEHOLDER: "Например: 25-50, 55 или i-viii (пусто — все страницы)",
    MODAL_PAGE_LABELS_NAME: "Искать по меткам страниц, а не по физическим",
    MODAL_DATES_NAME: "Выбрать даты для извлечения",
    MODAL_DATES_DESC: "Показывает все дни, когда были созданы аннотации внутри файла.",
    MODAL_DATES_NONE: "В этом файле нечего извлекать.",
    MODAL_COLORS_NAME: "Выбрать цвета для извлечения",
    // Every reader has a palette of its own — the PDF format defines none — so
    // the list can only be made of the colours this file turns out to hold.
    MODAL_COLORS_DESC: "Показывает все цвета аннотаций, найденные внутри файла.",
    MODAL_COLORS_NONE: "В этом файле нечего извлекать.",
    MODAL_COLOR_NONE: "Без цвета",
    MODAL_READING: "Чтение файла…",
    MODAL_TARGET_NAME: "Тип извлечения",
    MODAL_TARGET_CURRENT: "В текущую заметку",
    MODAL_TARGET_SINGLE: "В новую заметку",
    MODAL_TARGET_SEPARATE: "В отдельные заметки",
    MODAL_EXTRACT: "Извлечь аннотации",
    /**
     * A moment format. `D MMMM YYYY` renders "25 июля 2026" — moment's own `LL`
     * adds the "г." that Russian dates carry in prose but not in a list. The
     * days are sorted as `YYYY-MM-DD` whatever this says.
     */
    DATE_FORMAT: "D MMMM YYYY",

    // ─── Notices ─────────────────────────────────────────────────────────────────
    // A path reaches these from the clipboard and from the advanced extraction's
    // own field alike, so neither says where it came from.
    NOTICE_PATH_DESKTOP_ONLY: "Чтение PDF вне хранилища доступно только в десктопном приложении.",
    NOTICE_PATH_NOT_A_FILE: "Указанный путь не является файлом.",
    NOTICE_PATH_NOT_A_FILE_OR_FOLDER: "Указанный путь не является ни файлом, ни папкой.",
    NOTICE_PATH_UNREADABLE: "Указанный путь не удалось прочитать.",
    NOTICE_FOLDER_HAS_NO_PDFS: "В указанной папке нет PDF-файлов.",
    NOTICE_FILE_SKIPPED: "Этот PDF не удалось прочитать, он пропущен",
    NOTICE_EXTRACTION_FAILED: "Не удалось извлечь аннотации из этого PDF.",
    NOTICE_NOTE_PATH_INVALID: "Не удалось создать заметку с аннотациями: хранилище не принимает такой путь. Проверьте папку, подпапку и имя заметки в настройках.",
    NOTICE_NO_CURRENT_FILE: "Не удалось создать заметку с аннотациями: нет открытого файла, рядом с которым её положить. Откройте файл или назначьте папку хранилища для заметок.",
    NOTICE_PAGES_UNREADABLE: "Не удалось разобрать часть указанных страниц",
    NOTICE_NOTHING_SELECTED: "На выбранных страницах и датах аннотаций не найдено.",
    NOTICE_NO_NOTE_TO_INSERT_INTO: "Не удалось вставить аннотации: нет открытой заметки, куда их поместить. Откройте заметку или извлеките в новую.",
    NOTICE_COPIED: "Скопировано в буфер обмена",
    NOTICE_COPY_FAILED: "Не удалось скопировать в буфер обмена",

    // ─── Progress ────────────────────────────────────────────────────────────────
    // The line above the bar. Whatever is being read is named after the first of
    // these, so it ends without a full stop; the other two stand on their own.
    PROGRESS_EXTRACTING: "Извлечение аннотаций…",
    PROGRESS_READING: "Чтение",
    PROGRESS_WRITING: "Запись заметок…",
    PROGRESS_EXTRACTED: "Аннотаций извлечено",

    // ─── Written into exported notes ─────────────────────────────────────────────
    // The {{variables}} are names the formatter resolves; only the words around
    // them may be translated.
    NOTE_NO_ANNOTATIONS: "*Аннотации не найдены*",
    NOTE_VAULT_ROOT: "Корень хранилища",
    NOTE_NO_DATE: "Без даты",
    // The one template every annotation type starts on. `{{highlightedText}}`
    // renders empty for the types that mark up nothing.
    DEFAULT_NOTE_TEMPLATE: "{{highlightedText}}\n\n[с. {{pageLabel}}]\n\n{{body}}\n\n",
    DEFAULT_NOTE_NAME: "Аннотации из {{filename}}",
    DEFAULT_ONE_NOTE_NAME: "Аннотации из {{filename}}-{{counter}}",
    /** Names a note whose annotation has no comment to take a topic from. */
    NAME_NO_TOPIC: "Без темы {{counter}}",

    // ─── Annotation types ────────────────────────────────────────────────────────
    ANNOT_HIGHLIGHT: "Выделенный текст",
    ANNOT_UNDERLINE: "Подчёркнутый текст",
    ANNOT_SQUIGGLY: "Волнистое подчёркивание",
    ANNOT_STRIKEOUT: "Зачёркнутый текст",
    ANNOT_TEXT: "Комментарий-стикер",
    ANNOT_FREE_TEXT: "Свободный текст на странице",

    // ─── Template variables ──────────────────────────────────────────────────────
    VAR_HIGHLIGHTED_TEXT: "Выделенный в PDF текст",
    VAR_FOLDER: "Папка PDF-файла",
    VAR_FILENAME: "Имя PDF-файла (без расширения)",
    VAR_FILEPATH: "Путь к PDF-файлу",
    VAR_FILELINK: "[[Вики-ссылка]] для PDF внутри хранилища и путь file:// для внешних",
    VAR_PAGE_NUMBER: "Номер страницы с аннотацией (по счёту среди физических страниц)",
    VAR_PAGE_LABEL: "Метка страницы с аннотацией (так, как эту страницу пронумеровал автор документа)",
    VAR_AUTHOR: "Автор аннотации",
    VAR_BODY: "Текст комментария, если он есть",
    VAR_TYPE: "Тип аннотации",
    VAR_COLOR: "Цвет аннотации в формате #rrggbb (если PDF хранит цвета)",
    VAR_TOPIC: "Первая строка текста комментария",
    VAR_CREATED: "День создания аннотации в формате ГГГГ-ММ-ДД (если PDF хранит даты)",
    VAR_CREATED_TIME: "Время создания аннотации в формате ЧЧ:ММ (если PDF хранит время)",
    VAR_IS_EXTERNAL: "Истина для PDF вне хранилища, для {{#if isExternal}} в шаблоне",

    // ─── Settings: annotations ───────────────────────────────────────────────────
    SETTING_ANNOTATIONS_NAME: "Выберите типы аннотаций для извлечения",

    // ─── Settings: templates ─────────────────────────────────────────────────────
    // One sentence, not the pieces either side of the link: the link is woven in
    // by looking for HANDLEBARS_LINK inside it, so this sentence has to contain
    // that word literally.
    SECTION_TEMPLATES: "Шаблоны импорта",
    SECTION_TEMPLATES_DESC: "Шаблоны задают форматирование импортируемых аннотаций. В таблице переменных ниже перечислен доступный синтаксис Handlebars: при импорте эти переменные заменяются соответствующими значениями.",
    HANDLEBARS_LINK: "Handlebars",
    SHOW_VARIABLES_TABLE: "Показать таблицу переменных",
    HIDE_VARIABLES_TABLE: "Скрыть таблицу переменных",
    TABLE_VARIABLE: "Переменная (кликабельно)",
    TABLE_DESCRIPTION: "Описание",
    COPY_TOOLTIP: "Скопировать в буфер обмена",
    SETTING_TEMPLATE_NAME: "Шаблон форматирования",
    SETTING_TEMPLATE_DESC: "Шаблон по умолчанию применяется ко всем типам аннотаций, у которых собственный шаблон пустой.",
    OPTION_TEMPLATE_DEFAULT: "По умолчанию (для всех типов)",
    PLACEHOLDER_TEMPLATE_DEFAULT: "Пусто: сейчас этот тип аннотаций использует шаблон по умолчанию.",
    /**
     * Говорит о переменной, которую редактируемый тип не заполняет. На
     * устройстве с мышью всплывает над самой переменной, без мыши — стоит под
     * редактором. `{{variable}}` подставляется её именем, `{{type}}` —
     * названием типа: переводится только текст вокруг них.
     */
    WARNING_VARIABLE_UNFILLED: "Переменная {{variable}} останется пустой: тип «{{type}}» не размечает текст в PDF.",

    // ─── Settings: grouping and headings ─────────────────────────────────────────
    // Каждая группировка идёт в паре со своим заголовком: заголовок пишется
    // только там, где эта группировка собрала аннотации вместе.
    SETTING_GROUP_BY_FOLDER_NAME: "Группировать по папкам",
    SETTING_GROUP_BY_FOLDER_DESC: "Собирает вместе все PDF из одной папки и действует, только когда аннотации извлечены из нескольких папок.",
    SETTING_GROUP_BY_FILE_NAME: "Группировать по файлам",
    SETTING_GROUP_BY_FILE_DESC: "Собирает вместе все аннотации одного PDF и действует, только когда аннотации извлечены из нескольких файлов.",
    SETTING_GROUP_BY_DATE_NAME: "Группировать по дате создания",
    SETTING_GROUP_BY_DATE_DESC: "Группирует аннотации по дню создания — аннотации без даты идут последними.",
    SETTING_SORT_BY_TOPIC_NAME: "Группировать по темам",
    SETTING_SORT_BY_TOPIC_DESC: "Первая строка каждого комментария распознаётся как тема: в общей заметке аннотации собираются по ней, а в отдельных заметках она может названием.",
    SETTING_FOLDER_HEADING_NAME: "Добавлять заголовки папок",
    SETTING_FOLDER_HEADING_DESC: "Добавляет в текст заголовок с именем папки, когда аннотации группируются по папкам.",
    SETTING_FILE_HEADING_NAME: "Добавлять заголовки файлов",
    SETTING_FILE_HEADING_DESC: "Добавляет в текст заголовок с именем файла, когда аннотации группируются по файлам.",
    SETTING_DATE_HEADING_NAME: "Добавлять заголовки дат",
    SETTING_DATE_HEADING_DESC: "Добавляет в текст заголовок для каждой даты, когда аннотации группируются по дате создания.",
    SETTING_TOPIC_HEADING_NAME: "Собирать аннотации с одной темой под общим заголовком",
    SETTING_TOPIC_HEADING_DESC: "Добавляет заголовок для каждой темы и собирает под ним аннотации с этой темой.",
    SETTING_NEST_HEADINGS_NAME: "Упорядочивать заголовки в шаблонах и комментариях",
    SETTING_NEST_HEADINGS_DESC: "Автоматически сдвигает найденные заголовки с учётом заголовков групп для корректного структурирования заметки.",

    // ─── Settings: general rules ─────────────────────────────────────────────────
    // Действует при любом извлечении: куда попадают заметки, что делать с тегами
    // и с уже существующей заметкой.
    SECTION_GENERAL_RULES: "Общие правила извлечения",
    SETTING_PARAGRAPHS_NAME: "Разделять абзацы в выделенном тексте",
    SETTING_PARAGRAPHS_DESC: "Плагин будет пытаться определять границы абзацев по ряду признаков и разделять их указанным способом.",
    OPTION_PARAGRAPHS_BLANK: "Пустой строкой",
    OPTION_PARAGRAPHS_BREAK: "Переносом строки",
    OPTION_PARAGRAPHS_NONE: "Не разделять",
    SETTING_NOTE_LOCATION_NAME: "Расположение создаваемых заметок",
    SETTING_NOTE_LOCATION_DESC: "Выберите, куда будут помещены создаваемые заметки.",
    OPTION_NOTE_LOCATION_CURRENT: "В ту же папку, что и открытый файл",
    OPTION_NOTE_LOCATION_VAULT: "В указанную папку в хранилище",
    SETTING_NOTE_FOLDER_NAME: "Укажите папку в хранилище",
    SETTING_NOTE_FOLDER_DESC: "Начните вводить, чтобы увидеть подсказки, или оставьте пустым для размещения в корне хранилища.",
    PLACEHOLDER_VAULT_ROOT: "Если пусто, заметки попадут в корень хранилища",
    SETTING_EXTRACT_TAGS_NAME: "Извлекать теги из аннотаций в свойства заметок",
    SETTING_EXTRACT_TAGS_DESC: "Найденные в аннотациях теги автоматически переносятся в свойства заметок.",
    OPTION_EXTRACT_TAGS_NEVER: "Никогда",
    OPTION_EXTRACT_TAGS_ALWAYS: "Всегда",
    OPTION_EXTRACT_TAGS_SINGLE: "При извлечении в общую заметку",
    OPTION_EXTRACT_TAGS_SEPARATE: "При извлечении в отдельные заметки",
    SETTING_OVERWRITE_NAME: "Разрешить перезапись",
    SETTING_OVERWRITE_DESC: "Если заметка с таким именем уже есть, она будет заменена, а не дополнена.",

    // ─── Settings: separate notes ────────────────────────────────────────────────
    SECTION_SEPARATE_NOTES: "Извлечение в отдельные заметки",
    SETTING_TOPIC_TO_NAME_NAME: "Использовать тему комментария для названия заметки",
    SETTING_TOPIC_TO_NAME_DESC: "Включите, чтобы избежать дублирования {{topic}} при создании отдельных заметок, если он есть в вашем шаблоне.",
    SETTING_ONE_NOTE_NAME_NAME: "Шаблон имени для аннотаций, импортируемых в отдельные заметки",
    SETTING_ONE_NOTE_NAME_DESC: "Используйте уникальные переменные, например {{counter}}, иначе все аннотации попадут в одну заметку.",
    SETTING_NOTE_SUBFOLDER_NAME: "Подпапка (необязательно)",
    SETTING_NOTE_SUBFOLDER_DESC: "Если заполнено, по этому шаблону имени создаётся подпапка для отдельных заметок внутри выбранного расположения.",
    // Показывает, какого вида ответа ждёт поле: описание над ним уже говорит,
    // что пустое поле не создаёт подпапку.
    PLACEHOLDER_SUBFOLDER_EXAMPLE: "Например, {{filename}} или другая переменная с любым префиксом или суффиксом",
    SETTING_SECTION_SUBFOLDER_NAME: "Создавать подпапку для каждого раздела в PDF",
    SETTING_SECTION_SUBFOLDER_DESC: "Читает закладки самого PDF и кладёт каждую заметку в папку того раздела, где стоит её аннотация.",

    // ─── Settings: shared notes ──────────────────────────────────────────────────
    SECTION_SHARED_NOTES: "Извлечение в общие заметки",
    SETTING_NOTE_NAME_NAME: "Шаблон имени для аннотаций, импортируемых в общую заметку",
    SETTING_NOTE_NAME_DESC: "Используйте уникальные переменные, например {{filename}}, иначе все PDF будут писать аннотации в одну заметку.",

};
