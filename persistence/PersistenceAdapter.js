import { assert } from '../utils/assert.js';
import { NotePage } from '../models/NotePage.js';
import { TagRegistry } from '../registries/TagRegistry.js';

/**
 * PersistenceAdapter
 *
 * The entire storage-integration surface of briefs. It never
 * touches localStorage/IndexedDB/network itself -- it only ever calls
 * the host-supplied onSave/onLoad callbacks. Swapping local storage
 * for cloud sync later means the host passes different callbacks;
 * nothing else in this module changes.
 */
export class PersistenceAdapter {
  #onSave;
  #onLoad;
  #tagRegistry;

  /**
   * @param {(pageObject: object) => (void|Promise<void>)} onSave
   * @param {(pageId: string) => (object|Promise<object>)} onLoad
   * @param {TagRegistry|null} tagRegistry
   */
  constructor(onSave, onLoad, tagRegistry) {
    assert.function_(onSave, 'onSave');
    assert.function_(onLoad, 'onLoad');
    assert.instanceOfOrNull(tagRegistry, TagRegistry, 'tagRegistry');
    this.#onSave = onSave;
    this.#onLoad = onLoad;
    this.#tagRegistry = tagRegistry;
  }

  /**
   * @param {NotePage} page
   * @returns {Promise<void>}
   */
  async save(page) {
    assert.instanceOf(page, NotePage, 'page');
    await this.#onSave(page.toObject());
  }

  set tagRegistry(v) {
    assert.instanceOfOrNull(v, TagRegistry, 'tagRegistry');
    this.#tagRegistry = v;
  }

  /**
   * @param {string} pageId
   * @returns {Promise<NotePage>}
   */
  async load(pageId) {
    assert.nonEmptyString(pageId, 'pageId');
    const obj = await this.#onLoad(pageId);
    assert.plainObject(obj, 'result of onLoad');
    return NotePage.fromObject(obj, this.#tagRegistry);
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new PersistenceAdapter(
      obj.onSave,
      obj.onLoad,
      obj.tagRegistry ?? null
    );
  }
}
