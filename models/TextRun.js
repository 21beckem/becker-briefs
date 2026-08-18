import { assert } from '../utils/assert.js';

/**
 * TextRun
 *
 * One inline-formatted span of text. RichText is an ordered array of
 * these. Keeping formatting structured (rather than raw HTML) keeps
 * serialization portable and keeps the renderer in full control of
 * what markup is ever produced.
 */
export class TextRun {
  #text;
  #bold;
  #italic;
  #link;

  /**
   * @param {string} text
   * @param {boolean} bold
   * @param {boolean} italic
   * @param {string|null} link a URL, or null for no link
   */
  constructor(text, bold = false, italic = false, link = null) {
    assert.string(text, 'text');
    assert.boolean(bold, 'bold');
    assert.boolean(italic, 'italic');
    assert.stringOrNull(link, 'link');
    this.#text = text;
    this.#bold = bold;
    this.#italic = italic;
    this.#link = link;
  }

  get text() {
    return this.#text;
  }

  get bold() {
    return this.#bold;
  }

  get italic() {
    return this.#italic;
  }

  get link() {
    return this.#link;
  }

  /**
   * @returns {object}
   */
  toObject() {
    return {
      text: this.#text,
      bold: this.#bold,
      italic: this.#italic,
      link: this.#link,
    };
  }

  /**
   * @param {object} obj
   * @returns {TextRun}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new TextRun(
      obj.text,
      obj.bold ?? false,
      obj.italic ?? false,
      obj.link ?? null
    );
  }
}
