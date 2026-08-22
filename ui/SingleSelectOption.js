import { assert } from '../utils/assert.js';

export class SingleSelectOption {
  #id;
  #label;

  constructor(id, label) {
    assert.nonEmptyString(id, 'id');
    assert.nonEmptyString(label, 'label');

    this.#id = id;
    this.#label = label;
  }

  get id() {
    return this.#id;
  }

  get label() {
    return this.#label;
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new SingleSelectOption(obj.id, obj.label);
  }
}