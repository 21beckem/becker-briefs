import { assert } from '../utils/assert.js';

/**
 * Tag
 *
 * A plain descriptive label. Used identically at the page level
 * (e.g. "math class", a source/date label) and at the bullet level
 * (e.g. "math class" applied to one line). Carries no behavior --
 * behavior lives in TypeDefinition/TypeInstance instead.
 */
export class Tag {
  #id;
  #label;
  #color;

  /**
   * @param {string} id
   * @param {string} label
   * @param {string|null} color a CSS color string, or null for default
   */
  constructor(id, label, color = null) {
    assert.nonEmptyString(id, 'id');
    assert.nonEmptyString(label, 'label');
    assert.stringOrNull(color, 'color');
    this.#id = id;
    this.#label = label;
    this.#color = color;
  }

  get id() {
    return this.#id;
  }

  get label() {
    return this.#label;
  }

  get color() {
    return this.#color;
  }

  /**
   * @returns {object}
   */
  toObject() {
    return { id: this.#id, label: this.#label, color: this.#color };
  }

  /**
   * @param {object} obj
   * @returns {Tag}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new Tag(obj.id, obj.label, obj.color ?? null);
  }
}
