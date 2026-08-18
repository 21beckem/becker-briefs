import { assert } from '../utils/assert.js';
import { Tag } from './Tag.js';
import { HeadingBlock } from './HeadingBlock.js';
import { Bullet } from './Bullet.js';

/**
 * NotePage
 *
 * The aggregate root for one page of notes: page-level metadata tags
 * plus an ordered root-level content list mixing HeadingBlock and
 * Bullet instances. This is the exact shape (via toObject/fromObject)
 * that is handed to the host's injected persistence handlers.
 */
export class NotePage {
  #id;
  #name;
  #date;
  #tags;
  #content;

  /**
   * @param {string} id
   * @param {string|null} name
   * @param {Date} date
   * @param {Tag[]} tags page-level metadata tags (source, subject, etc.)
   * @param {(HeadingBlock|Bullet)[]} content root-level blocks, in order
   */
  constructor(id, name, date, tags, content) {
    assert.nonEmptyString(id, 'id');
    assert.stringOrNull(name, 'name');
    assert.instanceOf(date, Date, 'date');
    assert.arrayOf(tags, Tag, 'tags');
    assert.array(content, 'content');
    content.forEach((block, index) => {
      if (!(block instanceof HeadingBlock) && !(block instanceof Bullet))
        throw new TypeError(
          `content[${index}] must be a HeadingBlock or Bullet instance.`
        );
    });
    this.#id = id;
    this.#name = name;
    this.#date = date;
    this.#tags = [...tags];
    this.#content = [...content];
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  get date() {
    return new Date(this.#date.getTime());
  }

  get tags() {
    return [...this.#tags];
  }

  get content() {
    return [...this.#content];
  }

  /**
   * @param {string|null} name
   * @returns {NotePage}
   */
  withName(name) {
    assert.stringOrNull(name, 'name');
    return new NotePage(this.#id, name, this.#date, this.#tags, this.#content);
  }

  /**
   * @param {Tag} tag
   * @returns {NotePage}
   */
  withTagAdded(tag) {
    assert.instanceOf(tag, Tag, 'tag');
    if (this.#tags.some((existing) => existing.id === tag.id)) return this;
    return new NotePage(
      this.#id,
      this.#name,
      this.#date,
      [...this.#tags, tag],
      this.#content
    );
  }

  /**
   * @param {string} tagId
   * @returns {NotePage}
   */
  withTagRemoved(tagId) {
    assert.nonEmptyString(tagId, 'tagId');
    return new NotePage(
      this.#id,
      this.#name,
      this.#date,
      this.#tags.filter((tag) => tag.id !== tagId),
      this.#content
    );
  }

  /**
   * @param {(HeadingBlock|Bullet)[]} content
   * @returns {NotePage}
   */
  withContent(content) {
    return new NotePage(this.#id, this.#name, this.#date, this.#tags, content);
  }

  /**
   * Finds a bullet anywhere in the page's content by id.
   * @param {string} bulletId
   * @returns {Bullet|null}
   */
  findBulletById(bulletId) {
    assert.nonEmptyString(bulletId, 'bulletId');
    for (const block of this.#content) {
      if (block instanceof Bullet) {
        const found = block.findById(bulletId);
        if (found !== null) return found;
      }
    }
    return null;
  }

  /**
   * Returns a new NotePage with the bullet matching `bulletId` replaced
   * by the result of calling `updater` on it.
   * @param {string} bulletId
   * @param {(bullet: Bullet) => Bullet} updater
   * @returns {NotePage}
   */
  replaceBulletById(bulletId, updater) {
    assert.nonEmptyString(bulletId, 'bulletId');
    assert.function_(updater, 'updater');
    const newContent = this.#content.map((block) => {
      if (block instanceof Bullet) return block.replaceById(bulletId, updater);
      return block;
    });
    return this.withContent(newContent);
  }

  /**
   * @param {Node | null} activeEl
   * @returns {object}
   */
  toObject(activeElId) {
    return {
      id: this.#id,
      name: this.#name,
      date: this.#date.toISOString(),
      tags: this.#tags.map((tag) => tag.toObject()),
      content: this.#content.map((block) => block.toObject()),
      focusId: activeElId ?? undefined
    };
  }

  /**
   * @param {object} obj
   * @returns {NotePage}
   */
  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    const content = (obj.content ?? []).map((block) => {
      assert.plainObject(block, 'content item');
      if (block.blockType === 'heading') return HeadingBlock.fromObject(block);
      if (block.blockType === 'bullet') return Bullet.fromObject(block);
      throw new TypeError(`Unknown blockType: ${block.blockType}`);
    });
    return new NotePage(
      obj.id,
      obj.name ?? null,
      new Date(obj.date ?? Date.now()),
      (obj.tags ?? []).map((tag) => Tag.fromObject(tag)),
      content
    );
  }
}
