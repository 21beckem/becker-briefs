import { assert } from '../utils/assert.js';
import { TypeDefinition } from './TypeDefinition.js';

/**
 * TypeRegistry
 *
 * Immutable catalog of the functional types available to a briefs
 * instance, supplied entirely by the host application at construction
 * time. briefs itself never adds, removes, or knows about specific
 * type ids -- it only ever asks this registry "is `typeId` known?"
 * and "give me the TypeDefinition for `typeId`".
 */
export class TypeRegistry {
  #definitions;

  /**
   * @param {Function[]} definitions
   */
  constructor(definitions) {
    assert.arrayOf(definitions, Function, 'definitions');
    definitions.forEach(d => assert.instanceOf(d.constructor, Function, 'definition constructor'));

    const map = new Map();
    for (let i = 0; i < definitions.length; i++) {
      const definition = new definitions[i]();
      if (map.has(definition.id))
        throw new Error(`Duplicate type id in registry: ${definition.id}`);
      map.set(definition.id, definition);
    }
    this.#definitions = map;
  }

  /**
   * @param {string} typeId
   * @returns {boolean}
   */
  has(typeId) {
    assert.nonEmptyString(typeId, 'typeId');
    return this.#definitions.has(typeId);
  }

  /**
   * @param {string} typeId
   * @returns {TypeDefinition}
   */
  get(typeId) {
    assert.nonEmptyString(typeId, 'typeId');
    const definition = this.#definitions.get(typeId);
    if (definition === undefined)
      throw new Error(`No TypeDefinition registered for id: ${typeId}`);
    return definition;
  }

  /**
   * @returns {TypeDefinition[]}
   */
  list() {
    return [...this.#definitions.values()];
  }

  /**
   * @param {object} obj expects { definitions: TypeDefinition[] }
   * @returns {TypeRegistry}
   */
  static fromArray(arr) {
    assert.array(arr, 'arr');
    return new TypeRegistry(arr);
  }
}
