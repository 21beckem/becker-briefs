import { assert } from '../utils/assert.js';
import { RichText } from './RichText.js';

/**
 * HeadingBlock
 *
 * A heading line within a page. Headings sit at the page's root
 * content level alongside the outline, distinct from bullets -- they
 * are not nestable and carry no type/tags of their own.
 */
export class HeadingBlock {
  #id;
  #level;
  #text;

  /**
   * @param {string} id
   * @param {number} level integer 1-3
   * @param {RichText} text
   */
  constructor(id, level, text) {
    assert.nonEmptyString(id, 'id');
    assert.integerInRange(level, 'level', 1, 3);
    assert.instanceOf(text, RichText, 'text');
    this.#id = id;
    this.#level = level;
    this.#text = text;
  }

  get id() {
    return this.#id;
  }

  get level() {
    return this.#level;
  }

  get text() {
    return this.#text;
  }

  /**
   * @returns {'heading'}
   */
  get blockType() {
    return 'heading';
  }

  /**
   * @param {RichText} text
   * @returns {HeadingBlock}
   */
  withText(text) {
    assert.instanceOf(text, RichText, 'text');
    return new HeadingBlock(this.#id, this.#level, text);
  }

  /**
   * @param {number} level
   * @returns {HeadingBlock}
   */
  withLevel(level) {
    assert.integerInRange(level, 'level', 1, 3);
    return new HeadingBlock(this.#id, level, this.#text);
  }

  /**
   * @returns {object}
   */
  toObject() {
    return {
      blockType: 'heading',
      id: this.#id,
      level: this.#level,
      text: this.#text.toObject(),
    };
  }

  /**
   * @param {object} obj
   * @returns {HeadingBlock}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new HeadingBlock(obj.id, obj.level, RichText.fromObject(obj.text));
  }
}
