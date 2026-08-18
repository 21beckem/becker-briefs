import { assert } from '../utils/assert.js';
import { Tag } from '../models/Tag.js';

/**
 * TagRegistry
 *
 * Holds the set of plain descriptive tags known to a briefs
 * instance, used for autocomplete. New-tag creation is delegated to
 * an injected `onCreateTag` callback owned entirely by the host --
 * this registry never invents ids or persistence on its own.
 */
export class TagRegistry {
  #tags;
  #onCreateTag;

  /**
   * @param {Tag[]} initialTags
   * @param {(label: string) => (Tag|Promise<Tag>)} onCreateTag
   *   host-supplied callback invoked when the user creates a brand new
   *   tag; must return (or resolve to) a Tag instance.
   */
  constructor(initialTags, onCreateTag) {
    assert.arrayOf(initialTags, Tag, 'initialTags');
    assert.function_(onCreateTag, 'onCreateTag');
    this.#tags = new Map(initialTags.map((tag) => [tag.id, tag]));
    this.#onCreateTag = onCreateTag;
  }

  /**
   * @returns {Tag[]}
   */
  list() {
    return [...this.#tags.values()];
  }

  /**
   * Case-insensitive substring match against known tag labels.
   * @param {string} query
   * @returns {Tag[]}
   */
  find(query) {
    assert.string(query, 'query');
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return this.list();
    return this.list().filter((tag) =>
      tag.label.toLowerCase().includes(needle)
    );
  }

  /**
   * @param {string} tagId
   * @returns {boolean}
   */
  has(tagId) {
    assert.nonEmptyString(tagId, 'tagId');
    return this.#tags.has(tagId);
  }

  /**
   * @param {string} tagId
   * @returns {Tag}
   */
  get(tagId) {
    assert.nonEmptyString(tagId, 'tagId');
    const tag = this.#tags.get(tagId);
    if (tag === undefined) throw new Error(`No tag registered with id: ${tagId}`);
    return tag;
  }

  /**
   * Creates a new tag via the injected callback and adds it to this
   * registry's known set.
   * @param {string} label
   * @returns {Promise<Tag>}
   */
  async createTag(label) {
    assert.nonEmptyString(label, 'label');
    const existing = this.list().find(
      (tag) => tag.label.toLowerCase() === label.trim().toLowerCase()
    );
    if (existing !== undefined) return existing;
    const created = await this.#onCreateTag(label.trim());
    assert.instanceOf(created, Tag, 'result of onCreateTag');
    this.#tags.set(created.id, created);
    return created;
  }

  
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new TagRegistry(
      obj.initialTags ?? [],
      obj.onCreateTag
    )
  }
}
