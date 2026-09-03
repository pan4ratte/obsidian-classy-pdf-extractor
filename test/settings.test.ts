import {describe, expect, test} from '@jest/globals';
import {t} from '../lang/helpers';
import {
  ANNOTS_TREATED_AS_HIGHLIGHTS,
  cleanNoteName,
  DEFAULT_DESIRED_ANNOTATIONS,
  DEFAULT_TEMPLATE_KEY,
  findVariableUses,
  PDFAnnotationPluginSetting,
  resolveNotePath,
  SUPPORTED_ANNOTS,
  TEMPLATE_VARIABLES,
  unfilledVariablesFor,
} from '../src/settings';

describe('supported annotation types', () => {
  test('offers the text bearing subtypes and nothing graphical', () => {
    expect(SUPPORTED_ANNOTS.map((a) => a.subtype)).toEqual([
      'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Text', 'FreeText',
    ]);
  });

  test('excludes types whose content cannot become markdown', () => {
    const subtypes = SUPPORTED_ANNOTS.map((a) => a.subtype);
    for (const graphical of [
      'Ink', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Stamp',
      'Caret', 'FileAttachment', 'Link', 'Widget', 'Popup',
    ]) {
      expect(subtypes).not.toContain(graphical);
    }
  });

  test('only the types marking up no text leave a variable unfilled', () => {
    for (const {subtype, marksUpText} of SUPPORTED_ANNOTS) {
      expect(unfilledVariablesFor(subtype).names).toEqual(
        marksUpText ? [] : ['highlightedText']
      );
    }
  });

  test('an unfilled variable is named as the table names it', () => {
    // The editor looks the flagged names up in the template it is marking, so
    // one spelled differently here would never be found.
    for (const {subtype} of SUPPORTED_ANNOTS) {
      for (const name of unfilledVariablesFor(subtype).names) {
        expect(Object.keys(TEMPLATE_VARIABLES)).toContain(name);
      }
    }
  });

  test('a type that cannot fill one is named, to say so with', () => {
    expect(unfilledVariablesFor('Text').description).toBe(t.ANNOT_TEXT);
    expect(unfilledVariablesFor('FreeText').description).toBe(t.ANNOT_FREE_TEXT);
  });

  test('the default template is held to no one type\'s limits', () => {
    expect(unfilledVariablesFor(DEFAULT_TEMPLATE_KEY).names).toEqual([]);
    expect(unfilledVariablesFor('Nonsense').names).toEqual([]);
  });
});

describe('findVariableUses', () => {
  const at = (template: string, names: string[]) =>
    findVariableUses(template, names).map((use) => use.text);

  test('finds a variable and says where it is and which it is', () => {
    expect(findVariableUses('a {{topic}} b', ['topic'])).toEqual([
      {start: 2, end: 11, text: '{{topic}}', name: 'topic'},
    ]);
  });

  test('names the variable without the whitespace it was written with', () => {
    // The message names what it found, so a loosely written variable must not
    // come back as one the table has never heard of.
    expect(findVariableUses('{{ topic }}', ['topic'])[0].name).toBe('topic');
  });

  test('slicing on the offsets puts the template back together', () => {
    const template = '{{topic}} and {{body}}!';
    const uses = findVariableUses(template, ['topic', 'body']);
    let rebuilt = '';
    let written = 0;
    for (const use of uses) {
      rebuilt += template.slice(written, use.start) + use.text;
      written = use.end;
    }
    expect(rebuilt + template.slice(written)).toBe(template);
  });

  test('whitespace inside the braces is still the same variable', () => {
    expect(at('{{ topic }}', ['topic'])).toEqual(['{{ topic }}']);
    expect(at('{{\ttopic\t}}', ['topic'])).toEqual(['{{\ttopic\t}}']);
  });

  test('finds every use, not only the first', () => {
    expect(at('{{topic}} {{topic}}', ['topic'])).toHaveLength(2);
  });

  test('a shorter name does not stand in for a longer one', () => {
    expect(at('{{createdTime}}', ['created'])).toEqual([]);
    expect(at('{{created}} {{createdTime}}', ['created', 'createdTime']))
      .toEqual(['{{created}}', '{{createdTime}}']);
  });

  test('leaves alone what is not asked for', () => {
    expect(at('{{body}}', ['topic'])).toEqual([]);
    expect(at('{{topic}}', [])).toEqual([]);
    expect(at('topic', ['topic'])).toEqual([]);
  });

  test('the text markup types are exactly the ones carrying QuadPoints', () => {
    expect(ANNOTS_TREATED_AS_HIGHLIGHTS).toEqual([
      'Highlight', 'Underline', 'Squiggly', 'StrikeOut',
    ]);
  });

  test('every type has a description and a unique subtype', () => {
    const subtypes = SUPPORTED_ANNOTS.map((a) => a.subtype);
    expect(new Set(subtypes).size).toBe(subtypes.length);
    for (const annotation of SUPPORTED_ANNOTS) {
      expect(annotation.description.length).toBeGreaterThan(0);
    }
  });
});

describe('desired annotation checkboxes', () => {
  test('defaults to the marked up text: highlights, underlines, strikeouts', () => {
    const s = new PDFAnnotationPluginSetting();
    expect(s.desiredAnnotations).toEqual([
      'Highlight', 'Underline', 'StrikeOut',
    ]);
    expect(s.desiredAnnotations).toEqual(DEFAULT_DESIRED_ANNOTATIONS);
    expect(s.isAnnotationDesired('StrikeOut')).toBe(true);
    expect(s.isAnnotationDesired('Text')).toBe(false);
  });

  test('the default array is not shared between instances', () => {
    const a = new PDFAnnotationPluginSetting();
    a.setAnnotationDesired('Squiggly', true);
    const b = new PDFAnnotationPluginSetting();
    expect(b.isAnnotationDesired('Squiggly')).toBe(false);
    expect(DEFAULT_DESIRED_ANNOTATIONS).not.toContain('Squiggly');
  });

  test('every default is a type the plugin actually supports', () => {
    const subtypes = SUPPORTED_ANNOTS.map((a) => a.subtype);
    for (const desired of DEFAULT_DESIRED_ANNOTATIONS) {
      expect(subtypes).toContain(desired);
    }
  });

  test('checking a box keeps the listed type order', () => {
    const s = new PDFAnnotationPluginSetting();
    // One appended and one inserted in the middle, so an order that only
    // happened to hold at the end would not pass.
    s.setAnnotationDesired('FreeText', true);
    s.setAnnotationDesired('Squiggly', true);
    expect(s.desiredAnnotations).toEqual([
      'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'FreeText',
    ]);
  });

  test('unchecking removes only that type', () => {
    const s = new PDFAnnotationPluginSetting();
    s.setAnnotationDesired('Highlight', false);
    expect(s.desiredAnnotations).toEqual(['Underline', 'StrikeOut']);
  });

  test('checking a box twice does not duplicate it', () => {
    const s = new PDFAnnotationPluginSetting();
    s.setAnnotationDesired('Squiggly', true);
    s.setAnnotationDesired('Squiggly', true);
    expect(s.desiredAnnotations.filter((t) => t === 'Squiggly')).toHaveLength(1);
  });

  test('unchecking everything yields an empty selection', () => {
    const s = new PDFAnnotationPluginSetting();
    for (const {subtype} of SUPPORTED_ANNOTS) s.setAnnotationDesired(subtype, false);
    expect(s.desiredAnnotations).toEqual([]);
    s.setAnnotationDesired('FreeText', true);
    expect(s.desiredAnnotations).toEqual(['FreeText']);
  });

  test('a subtype added to data.json by hand survives a checkbox change', () => {
    const s = new PDFAnnotationPluginSetting();
    s.desiredAnnotations = ['Text', 'Redact'];
    s.setAnnotationDesired('Highlight', true);
    expect(s.desiredAnnotations).toEqual(['Highlight', 'Text', 'Redact']);
  });
});

describe('naming a note per annotation after its topic', () => {
  test('is on, so a note is found by what its comment says it is about', () => {
    expect(new PDFAnnotationPluginSetting().topicToNoteName).toBe(true);
  });

  test('names a note whose annotation has no comment by number', () => {
    // Rendered by the plugin against {{counter}}; the counter is what keeps
    // the untitled notes of one PDF apart.
    expect(t.NAME_NO_TOPIC).toContain('{{counter}}');
  });

  test('is a field of its own, which is what makes it load', () => {
    // The plugin reads back every field the settings object declares, so a
    // setting that is declared cannot be one that silently never loads.
    expect(Object.keys(new PDFAnnotationPluginSetting()))
      .toContain('topicToNoteName');
  });
});

describe('a subfolder per section of the PDF', () => {
  test('is off, since it reads the outline of every PDF extracted', () => {
    expect(new PDFAnnotationPluginSetting().subfolderPerSection).toBe(false);
  });

  test('is a field of its own, which is what makes it load', () => {
    expect(Object.keys(new PDFAnnotationPluginSetting()))
      .toContain('subfolderPerSection');
  });
});

describe('cleanNoteName', () => {
  test('a name a vault already takes is left alone', () => {
    expect(cleanNoteName('Annotations for Paper-1')).toBe(
      'Annotations for Paper-1'
    );
  });

  test('characters a vault name cannot hold are dropped', () => {
    expect(cleanNoteName('Chapter 1: what "counts"?')).toBe(
      'Chapter 1 what counts'
    );
  });

  test('a slash names no folder, since the subfolder setting does that', () => {
    expect(cleanNoteName('Part 1/Chapter 2')).toBe('Part 1 Chapter 2');
  });

  test('the line breaks a topic carries in become spaces', () => {
    expect(cleanNoteName('First line\r\nsecond line')).toBe(
      'First line second line'
    );
  });

  test('a name that renders nothing usable comes back empty', () => {
    expect(cleanNoteName('')).toBe('');
    expect(cleanNoteName('   ')).toBe('');
    expect(cleanNoteName('???')).toBe('');
    expect(cleanNoteName('...')).toBe('');
  });

  test('no leading dot, which would write a note nobody sees', () => {
    expect(cleanNoteName('.hidden')).toBe('hidden');
  });

  test('no trailing dot or space, which a file system would refuse', () => {
    expect(cleanNoteName('Ibid. ')).toBe('Ibid');
  });

  test('a topic of a whole paragraph is cut to a name of a length', () => {
    const cleaned = cleanNoteName('word '.repeat(60));
    expect(cleaned.length).toBeLessThanOrEqual(100);
    expect(cleaned.endsWith(' ')).toBe(false);
  });

  test('the cut falls between characters, never inside one', () => {
    // Counted as they are read: 120 emoji are 240 UTF-16 units, and cutting by
    // those would leave half of one behind — a name no file system takes.
    expect(cleanNoteName('😀'.repeat(120))).toBe('😀'.repeat(100));
  });

  test('a name is as long in any alphabet', () => {
    expect([...cleanNoteName('я'.repeat(120))]).toHaveLength(100);
  });
});

describe('resolveNotePath', () => {
  const resolve = (
    over: Partial<PDFAnnotationPluginSetting>,
    subfolder = '',
    currentFolder = 'Papers/2024'
  ) => {
    const settings = new PDFAnnotationPluginSetting();
    Object.assign(settings, over);
    return resolveNotePath(
      settings, currentFolder, 'Annotations for Paper.md', subfolder
    );
  };

  test('beside the current file puts the note in the folder it is in', () => {
    expect(resolve({noteLocation: 'current'}))
      .toBe('Papers/2024/Annotations for Paper.md');
  });

  test('beside a file at the vault root writes to the root', () => {
    // Obsidian gives the root folder the path '/'.
    expect(resolve({noteLocation: 'current'}, '', '/'))
      .toBe('Annotations for Paper.md');
    // Nothing open at all.
    expect(resolve({noteLocation: 'current'}, '', ''))
      .toBe('Annotations for Paper.md');
  });

  test('the note folder is ignored beside the current file', () => {
    expect(resolve({noteLocation: 'current', noteFolder: 'Notes'}))
      .toBe('Papers/2024/Annotations for Paper.md');
  });

  test('a subfolder goes under the current file wherever it is', () => {
    // The subfolder belongs to the extraction into separate notes, which
    // writes as many notes beside the current file as into a vault folder.
    expect(resolve({noteLocation: 'current', noteFolder: 'Notes'}, 'Paper'))
      .toBe('Papers/2024/Paper/Annotations for Paper.md');
  });

  test('an empty vault folder is the vault root', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: ''}))
      .toBe('Annotations for Paper.md');
  });

  test('the note goes in the named vault folder', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes/PDFs'}))
      .toBe('Notes/PDFs/Annotations for Paper.md');
  });

  test('a rendered subfolder goes under the folder', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, 'Paper'))
      .toBe('Notes/Paper/Annotations for Paper.md');
  });

  test('a subfolder without a folder sits at the vault root', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: ''}, 'Paper'))
      .toBe('Paper/Annotations for Paper.md');
  });

  test('a subfolder template may render a nested path', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, '2024/Paper'))
      .toBe('Notes/2024/Paper/Annotations for Paper.md');
  });

  test('stray slashes and spaces do not double up or dangle', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: '/Notes/'}, ' Paper '))
      .toBe('Notes/Paper/Annotations for Paper.md');
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes//PDFs'}))
      .toBe('Notes/PDFs/Annotations for Paper.md');
    // What the folder suggester offers for the vault root.
    expect(resolve({noteLocation: 'vault', noteFolder: '/'}))
      .toBe('Annotations for Paper.md');
  });

  test('characters a vault path cannot hold are dropped, not passed on', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, 'Paper: a study?'))
      .toBe('Notes/Paper a study/Annotations for Paper.md');
  });

  test('a folder does not end with a dot, which the vault refuses', () => {
    // A section heading ending in an initial is the ordinary way this happens.
    expect(resolve(
      {noteLocation: 'vault', noteFolder: 'Notes'},
      '1. Трепет перед Богом, Скорняков Я. Г.'
    )).toBe('Notes/1. Трепет перед Богом, Скорняков Я. Г/Annotations for Paper.md');
  });

  test('every part of a nested subfolder is named the same way', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, 'Ibid. /Ch. 2. '))
      .toBe('Notes/Ibid/Ch. 2/Annotations for Paper.md');
  });

  test('a folder nobody would see is not made', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, '.hidden'))
      .toBe('Notes/hidden/Annotations for Paper.md');
    // Nothing usable left: the note goes in the folder above.
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, '...'))
      .toBe('Notes/Annotations for Paper.md');
  });
});

describe('tag extraction', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeTagExtraction(value);

  test('starts on the notes where a tag is that annotation\'s own subject', () => {
    expect(new PDFAnnotationPluginSetting().extractTags).toBe('separate');
  });

  // The default and the fallback are separate choices: an unreadable value is
  // not an invitation to start moving tags the reader never asked to move.
  test('an unreadable value still falls back to never, not to the default', () => {
    expect(normalize('sometimes')).toBe('never');
    expect(new PDFAnnotationPluginSetting().extractTags).not.toBe('never');
  });

  test('a mode this version knows is kept', () => {
    expect(normalize('separate')).toBe('separate');
    expect(normalize('always')).toBe('always');
  });

  test('anything else falls back to never', () => {
    expect(normalize('sometimes')).toBe('never');
    expect(normalize(true)).toBe('never');
    expect(normalize(undefined)).toBe('never');
  });

  const asks = (mode: string, onePerAnnotation: boolean) => {
    const settings = new PDFAnnotationPluginSetting();
    (settings as unknown as Record<string, unknown>).extractTags = mode;
    return settings.extractsTags(onePerAnnotation);
  };

  test.each([
    ['never', false, false],
    ['never', true, false],
    ['always', false, true],
    ['always', true, true],
    // A note being inserted into is a single note, and asks with false.
    ['single', false, true],
    ['single', true, false],
    ['separate', false, false],
    ['separate', true, true],
  ])('%s, one note per annotation %p: %p', (mode, onePerAnnotation, expected) => {
    expect(asks(mode, onePerAnnotation)).toBe(expected);
  });
});

describe('separating the paragraphs of a highlight', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeParagraphSeparation(value);

  test('starts on the blank line that makes them paragraphs', () => {
    expect(new PDFAnnotationPluginSetting().paragraphSeparation).toBe('blank');
  });

  test('a separator this version knows is kept', () => {
    expect(normalize('break')).toBe('break');
    expect(normalize('none')).toBe('none');
  });

  test('anything else falls back to the blank line', () => {
    expect(normalize('paragraph')).toBe('blank');
    expect(normalize(true)).toBe('blank');
    expect(normalize(undefined)).toBe('blank');
  });
});

describe('normalizeAnnotationTemplates', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeAnnotationTemplates(value);

  test('keeps the templates data.json holds, blanks and all', () => {
    expect(normalize({Highlight: 'H', Text: ''})).toEqual({
      Highlight: 'H',
      Underline: '',
      Squiggly: '',
      StrikeOut: '',
      Text: '',
      FreeText: '',
    });
  });

  test('a type this version knows and the file does not has none of its own', () => {
    expect(normalize({}).FreeText).toBe('');
  });

  test('anything that is not a template is read as none', () => {
    expect(normalize({Highlight: 42, Text: null}).Highlight).toBe('');
    expect(normalize(null).Text).toBe('');
    expect(normalize('a template').Highlight).toBe('');
  });

  test('a type the file knows and this version does not is dropped', () => {
    expect(normalize({Ink: 'drawn'})).not.toHaveProperty('Ink');
  });
});

describe('normalizeDesiredAnnotations', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeDesiredAnnotations(value);

  test('accepts a list of subtypes unchanged', () => {
    expect(normalize(['Text', 'FreeText'])).toEqual(['Text', 'FreeText']);
    expect(normalize([])).toEqual([]);
  });

  test('rejects anything that is not a list of subtypes', () => {
    expect(normalize(undefined)).toBeNull();
    expect(normalize(null)).toBeNull();
    expect(normalize(42)).toBeNull();
    expect(normalize('Text, Highlight')).toBeNull();
    expect(normalize(['Text', 7])).toBeNull();
    expect(normalize({Text: true})).toBeNull();
  });
});
