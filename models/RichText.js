import { assert } from '../utils/assert.js';
import { TextRun } from './TextRun.js';

/**
 * RichText
 *
 * An ordered sequence of TextRun instances forming one line of
 * formatted text (a bullet's content, or a heading's content).
 */
export class RichText {
  #runs;

  /**
   * @param {TextRun[]} runs
   */
  constructor(runs) {
    assert.arrayOf(runs, TextRun, 'runs');
    this.#runs = [...runs];
  }

  get runs() {
    return [...this.#runs];
  }

  /**
   * Convenience factory for the common case of a single unformatted run.
   * @param {string} text
   * @returns {RichText}
   */
  static plain(text) {
    assert.string(text, 'text');
    return new RichText([new TextRun(text, false, false, null)]);
  }

  /**
   * @returns {string} concatenated plain text, useful for search indexing
   */
  toPlainText() {
    return this.#runs.map((run) => run.text).join('');
  }

  /**
   * @returns {boolean}
   */
  isEmpty() {
    return this.toPlainText().trim().length === 0;
  }

  /**
   * @returns {object}
   */
  toObject() {
    return { runs: this.#runs.map((run) => run.toObject()) };
  }

  /**
   * @param {object} obj
   * @returns {RichText}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    assert.array(obj.runs, 'obj.runs');
    return new RichText(obj.runs.map((run) => TextRun.fromObject(run)));
  }
}
