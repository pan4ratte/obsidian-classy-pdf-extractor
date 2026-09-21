import {describe, expect, test} from '@jest/globals';
import {pathFromClipboard} from '../src/localPath';

describe('pathFromClipboard', () => {
  test('unescapes a path copied out of Calibre on a Mac', () => {
    const copied = String.raw`/Users/grandiozova/iCalibre/Inghrem\ M.\ A.\,\ Alikin\ V.\ A_/Istorichieskii\ mietod\ ghiermienievtiki_.\ v\ kontiekstie\ sovriemiennogho\ ievanghiel\'skogho\ diskurs\ \(68\)/Istorichieskii\ mietod\ ghiermienievtiki_.\ v\ -\ Inghrem\ M.\ A.\,\ Alikin\ V.\ A_.pdf`;
    expect(pathFromClipboard(copied)).toBe(
      "/Users/grandiozova/iCalibre/Inghrem M. A., Alikin V. A_/Istorichieskii mietod ghiermienievtiki_. v kontiekstie sovriemiennogho ievanghiel'skogho diskurs (68)/Istorichieskii mietod ghiermienievtiki_. v - Inghrem M. A., Alikin V. A_.pdf"
    );
  });

  test('leaves a Windows path its backslashes', () => {
    expect(pathFromClipboard(String.raw`"C:\Books\My book.pdf"`))
      .toBe(String.raw`C:\Books\My book.pdf`);
    expect(pathFromClipboard(String.raw`\\server\share\a.pdf`))
      .toBe(String.raw`\\server\share\a.pdf`);
  });

  test('takes a quoted path as written', () => {
    expect(pathFromClipboard(String.raw`'/Users/me/a\b.pdf'`)).toBe(String.raw`/Users/me/a\b.pdf`);
  });

  test('drops the line ending a terminal copies with it', () => {
    expect(pathFromClipboard('/Users/me/a.pdf\n')).toBe('/Users/me/a.pdf');
  });

  test('reads a file URL as the path it encodes', () => {
    expect(pathFromClipboard('file:///Users/me/My%20book.pdf')).toBe('/Users/me/My book.pdf');
    expect(pathFromClipboard('file:///C:/Books/My%20book.pdf')).toBe('C:/Books/My book.pdf');
  });

  test('leaves a vault path alone', () => {
    expect(pathFromClipboard('Books/My book.pdf')).toBe('Books/My book.pdf');
  });
});
