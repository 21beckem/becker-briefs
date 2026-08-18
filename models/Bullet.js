import { assert } from '../utils/assert.js';
import { RichText } from './RichText.js';
import { TypeInstance } from './TypeInstance.js';
import { Tag } from './Tag.js';

/**
 * Bullet
 *
 * A single outline entry. Bullets nest via `children`, forming a tree.
 * Bullet is treated as immutable: every mutating method returns a new
 * Bullet instance rather than changing this one in place. This keeps
 * data flow predictable for the UI layer, which always re-renders from
 * a fresh model reference rather than guessing what changed.
 */
export class Bullet {
  #id;
  #text;
  #type;
  #tags;
  #children;
  #collapsed;

  /**
   * @param {string} id
   * @param {RichText} text
   * @param {TypeInstance|null} type
   * @param {Tag[]} tags
   * @param {Bullet[]} children
   * @param {boolean} collapsed
   */
  constructor(id, text, type, tags, children, collapsed = false) {
    assert.nonEmptyString(id, 'id');
    assert.instanceOf(text, RichText, 'text');
    assert.instanceOfOrNull(type, TypeInstance, 'type');
    assert.arrayOf(tags, Tag, 'tags');
    assert.arrayOf(children, Bullet, 'children');
    assert.boolean(collapsed, 'collapsed');
    this.#id = id;
    this.#text = text;
    this.#type = type;
    this.#tags = [...tags];
    this.#children = [...children];
    this.#collapsed = collapsed;
  }

  get id() {
    return this.#id;
  }

  get text() {
    return this.#text;
  }

  get type() {
    return this.#type;
  }

  get tags() {
    return [...this.#tags];
  }

  get children() {
    return [...this.#children];
  }

  get collapsed() {
    return this.#collapsed;
  }

  /**
   * @returns {'bullet'}
   */
  get blockType() {
    return 'bullet';
  }

  /**
   * @param {RichText} text
   * @returns {Bullet}
   */
  withText(text) {
    assert.instanceOf(text, RichText, 'text');
    return new Bullet(
      this.#id,
      text,
      this.#type,
      this.#tags,
      this.#children,
      this.#collapsed
    );
  }

  /**
   * @param {TypeInstance|null} type
   * @returns {Bullet}
   */
  withType(type) {
    assert.instanceOfOrNull(type, TypeInstance, 'type');
    return new Bullet(
      this.#id,
      this.#text,
      type,
      this.#tags,
      this.#children,
      this.#collapsed
    );
  }

  /**
   * @param {Tag} tag
   * @returns {Bullet}
   */
  withTagAdded(tag) {
    assert.instanceOf(tag, Tag, 'tag');
    if (this.#tags.some((existing) => existing.id === tag.id)) return this;
    return new Bullet(
      this.#id,
      this.#text,
      this.#type,
      [...this.#tags, tag],
      this.#children,
      this.#collapsed
    );
  }

  /**
   * @param {string} tagId
   * @returns {Bullet}
   */
  withTagRemoved(tagId) {
    assert.nonEmptyString(tagId, 'tagId');
    return new Bullet(
      this.#id,
      this.#text,
      this.#type,
      this.#tags.filter((tag) => tag.id !== tagId),
      this.#children,
      this.#collapsed
    );
  }

  /**
   * @param {Bullet[]} children
   * @returns {Bullet}
   */
  withChildren(children) {
    assert.arrayOf(children, Bullet, 'children');
    return new Bullet(
      this.#id,
      this.#text,
      this.#type,
      this.#tags,
      children,
      this.#collapsed
    );
  }

  /**
   * @param {boolean} collapsed
   * @returns {Bullet}
   */
  withCollapsed(collapsed) {
    assert.boolean(collapsed, 'collapsed');
    return new Bullet(
      this.#id,
      this.#text,
      this.#type,
      this.#tags,
      this.#children,
      collapsed
    );
  }

  /**
   * Depth-first search for a bullet by id within this bullet's own
   * subtree (including itself).
   * @param {string} id
   * @returns {Bullet|null}
   */
  findById(id) {
    assert.nonEmptyString(id, 'id');
    if (this.#id === id) return this;
    for (const child of this.#children) {
      const found = child.findById(id);
      if (found !== null) return found;
    }
    return null;
  }

  /**
   * Returns a new Bullet subtree with the bullet matching `id` replaced
   * by the result of calling `updater` on it. Returns `this` unchanged
   * if no match is found in this subtree.
   * @param {string} id
   * @param {(bullet: Bullet) => Bullet} updater
   * @returns {Bullet}
   */
  replaceById(id, updater) {
    assert.nonEmptyString(id, 'id');
    assert.function_(updater, 'updater');
    if (this.#id === id) return updater(this);
    let changed = false;
    const newChildren = this.#children.map((child) => {
      const replaced = child.replaceById(id, updater);
      if (replaced !== child) changed = true;
      return replaced;
    });
    return changed ? this.withChildren(newChildren) : this;
  }

  /**
   * @returns {object}
   */
  toObject() {
    return {
      blockType: 'bullet',
      id: this.#id,
      text: this.#text.toObject(),
      type: this.#type === null ? null : this.#type.toObject(),
      tags: this.#tags.map((tag) => tag.toObject()),
      children: this.#children.map((child) => child.toObject()),
      collapsed: this.#collapsed,
    };
  }

  /**
   * @param {object} obj
   * @returns {Bullet}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    return new Bullet(
      obj.id,
      RichText.fromObject(obj.text ?? {}),
      obj.type == null ? null : TypeInstance.fromObject(obj.type),
      (obj.tags ?? []).map((tag) => Tag.fromObject(tag)),
      (obj.children ?? []).map((child) => Bullet.fromObject(child)),
      obj.collapsed ?? false
    );
  }
}
