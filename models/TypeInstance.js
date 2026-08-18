import { assert } from '../utils/assert.js';

/**
 * TypeInstance
 *
 * Represents a functional type applied to a specific bullet. This
 * class deliberately does NOT know how to render or behave -- it just
 * carries a reference to a registered type id plus that type's data
 * payload. The actual behavior lives in the host-supplied
 * TypeDefinition subclass, looked up by typeId in a TypeRegistry.
 */
export class TypeInstance {
  #typeId;
  #data;

  /**
   * @param {string} typeId must match a TypeDefinition registered elsewhere
   * @param {object} data shape owned entirely by that type definition
   */
  constructor(typeId, data) {
    assert.nonEmptyString(typeId, 'typeId');
    assert.plainObject(data, 'data');
    this.#typeId = typeId;
    this.#data = { ...data };
  }

  get typeId() {
    return this.#typeId;
  }

  get data() {
    return { ...this.#data };
  }

  /**
   * Returns a new TypeInstance with merged data. TypeInstance is treated
   * as immutable so callers always get a fresh instance back.
   * @param {object} patch
   * @returns {TypeInstance}
   */
  withData(patch) {
    assert.plainObject(patch, 'patch');
    return new TypeInstance(this.#typeId, { ...this.#data, ...patch });
  }

  /**
   * @returns {object}
   */
  toObject() {
    return { typeId: this.#typeId, data: { ...this.#data } };
  }

  /**
   * @param {object} obj
   * @returns {TypeInstance}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new TypeInstance(obj.typeId, obj.data ?? {});
  }
}
