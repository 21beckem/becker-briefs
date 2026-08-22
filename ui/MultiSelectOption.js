import { assert } from '../utils/assert.js';

export class MultiSelectOption {
  #id;
  #label;
  #color;

  constructor(id, label, color) {
    assert.string(id, 'id');
    assert.string(label, 'label');
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

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new MultiSelectOption(
        obj.id,
        obj.label,
        obj.color === undefined ? null : obj.color
    );
  }
}