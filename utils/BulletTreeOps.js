import { assert } from './assert.js';
import { Bullet } from '../models/Bullet.js';
import { RichText } from '../models/RichText.js';

/**
 * BulletTreeOps
 *
 * Static helpers for structural edits to a content array (an ordered
 * list of HeadingBlock/Bullet, either a NotePage's root content or a
 * Bullet's children). These operations require sibling/parent
 * awareness that a single Bullet instance does not have on its own,
 * which is why they live here rather than on Bullet itself. All
 * operations are pure: they return a new content array (or the same
 * array by reference if nothing changed) and never mutate their input.
 */
export class BulletTreeOps {
  /**
   * Finds the level (content array) directly containing a bullet with
   * the given id, and applies `transformer(list, index)` to it,
   * rebuilding ancestor Bullets as needed. Recurses into every
   * Bullet's children until a match is found.
   * @param {Array} content
   * @param {string} targetId
   * @param {(list: Array, index: number) => Array} transformer
   * @returns {Array}
   */
  static applyAtLevel(content, targetId, transformer) {
    assert.array(content, 'content');
    assert.nonEmptyString(targetId, 'targetId');
    assert.function_(transformer, 'transformer');
    const index = content.findIndex(
      (block) => block instanceof Bullet && block.id === targetId
    );
    if (index !== -1) return transformer(content, index);

    let changed = false;
    const next = content.map((block) => {
      if (block instanceof Bullet) {
        const children = block.children;
        const newChildren = BulletTreeOps.applyAtLevel(children, targetId, transformer);
        if (newChildren !== children) {
          changed = true;
          return block.withChildren(newChildren);
        }
      }
      return block;
    });
    return changed ? next : content;
  }

  /**
   * Inserts `newBullet` immediately after the bullet matching `targetId`,
   * as a sibling at the same level.
   * @param {Array} content
   * @param {string} targetId
   * @param {Bullet} newBullet
   * @returns {Array}
   */
  static insertAfter(content, targetId, newBullet) {
    assert.instanceOf(newBullet, Bullet, 'newBullet');
    return BulletTreeOps.applyAtLevel(content, targetId, (list, index) => {
      const next = [...list];
      next.splice(index + 1, 0, newBullet);
      return next;
    });
  }

  /**
   * Removes the bullet matching `targetId`. Its children, if any, are
   * promoted in place so they are never silently discarded.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static remove(content, targetId) {
    return BulletTreeOps.applyAtLevel(content, targetId, (list, index) => {
      const target = list[index];
      const next = [...list];
      next.splice(index, 1, ...target.children);
      return next;
    });
  }

  /**
   * Makes the bullet matching `targetId` a child of its immediately
   * preceding sibling at the same level. No-op if it has no preceding
   * sibling, or if that sibling is a heading rather than a bullet.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static indent(content, targetId) {
    return BulletTreeOps.applyAtLevel(content, targetId, (list, index) => {
      if (index === 0) return list;
      const previous = list[index - 1];
      if (!(previous instanceof Bullet)) return list;
      const target = list[index];
      const next = [...list];
      next.splice(index, 1);
      next[index - 1] = previous.withChildren([...previous.children, target]);
      return next;
    });
  }

  /**
   * Moves the bullet matching `targetId` out of its parent, making it
   * a sibling immediately following its former parent at the parent's
   * own level. No-op if the bullet is already at the root/top level.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static outdent(content, targetId) {
    assert.array(content, 'content');
    assert.nonEmptyString(targetId, 'targetId');
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      if (!(block instanceof Bullet)) continue;

      const childIndex = block.children.findIndex((child) => child.id === targetId);
      if (childIndex !== -1) {
        const target = block.children[childIndex];
        const remainingChildren = [...block.children];
        remainingChildren.splice(childIndex, 1);
        const newParent = block.withChildren(remainingChildren);
        const next = [...content];
        next[i] = newParent;
        next.splice(i + 1, 0, target);
        return next;
      }

      const children = block.children;
      const newChildren = BulletTreeOps.outdent(children, targetId);
      if (newChildren !== children) {
        const next = [...content];
        next[i] = block.withChildren(newChildren);
        return next;
      }
    }
    return content;
  }

  /**
   * Merges the bullet matching `targetId` into its immediately
   * preceding sibling: the preceding sibling's text is appended with
   * the target's text, the target's children are appended to the
   * preceding sibling's children, and the target is removed. No-op if
   * there is no preceding sibling at the same level.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static mergeWithPrevious(content, targetId) {
    return BulletTreeOps.applyAtLevel(content, targetId, (list, index) => {
      if (index === 0) return list;
      const previous = list[index - 1];
      if (!(previous instanceof Bullet)) return list;
      const target = list[index];
      const mergedText = new RichText([...previous.text.runs, ...target.text.runs]);
      const mergedPrevious = previous
        .withText(mergedText)
        .withChildren([...previous.children, ...target.children]);
      const next = [...list];
      next[index - 1] = mergedPrevious;
      next.splice(index, 1);
      return next;
    });
  }

  /**
   * Swaps the block matching `targetId` (a HeadingBlock or Bullet)
   * with its immediately preceding sibling at the same level. No-op
   * if already first at that level. Works for headings and bullets
   * alike since both expose `.id`.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static moveUp(content, targetId) {
    return BulletTreeOps.#swapAtLevel(content, targetId, -1);
  }

  /**
   * Swaps the block matching `targetId` with its immediately
   * following sibling at the same level. No-op if already last.
   * @param {Array} content
   * @param {string} targetId
   * @returns {Array}
   */
  static moveDown(content, targetId) {
    return BulletTreeOps.#swapAtLevel(content, targetId, 1);
  }

  static #swapAtLevel(content, targetId, delta) {
    assert.array(content, 'content');
    assert.nonEmptyString(targetId, 'targetId');
    const index = content.findIndex((block) => block.id === targetId);
    if (index !== -1) {
      const swapIndex = index + delta;
      if (swapIndex < 0 || swapIndex >= content.length) return content;
      const next = [...content];
      const tmp = next[index];
      next[index] = next[swapIndex];
      next[swapIndex] = tmp;
      return next;
    }
    let changed = false;
    const next = content.map((block) => {
      if (block instanceof Bullet) {
        const children = block.children;
        const newChildren = BulletTreeOps.#swapAtLevel(children, targetId, delta);
        if (newChildren !== children) {
          changed = true;
          return block.withChildren(newChildren);
        }
      }
      return block;
    });
    return changed ? next : content;
  }

  /**
   * Replaces the block matching `targetId` with `newBlock` at the
   * exact same position (same level, same index). Used for converting
   * between Bullet and HeadingBlock. Note: if `targetId` refers to a
   * nested Bullet, `newBlock` is placed at that same nested level --
   * callers wanting to convert a nested bullet into a root-level
   * heading must outdent it to the root first.
   * @param {Array} content
   * @param {string} targetId
   * @param {HeadingBlock|Bullet} newBlock
   * @returns {Array}
   */
  static replaceBlock(content, targetId, newBlock) {
    assert.array(content, 'content');
    assert.nonEmptyString(targetId, 'targetId');
    const index = content.findIndex((block) => block.id === targetId);
    if (index !== -1) {
      const next = [...content];
      next[index] = newBlock;
      return next;
    }
    let changed = false;
    const next = content.map((block) => {
      if (block instanceof Bullet) {
        const children = block.children;
        const newChildren = BulletTreeOps.replaceBlock(children, targetId, newBlock);
        if (newChildren !== children) {
          changed = true;
          return block.withChildren(newChildren);
        }
      }
      return block;
    });
    return changed ? next : content;
  }

  /**
   * Returns the nesting depth (0 = root level) of the block matching
   * `targetId`, or -1 if not found.
   * @param {Array} content
   * @param {string} targetId
   * @param {number} depth
   * @returns {number}
   */
  static depthOf(content, targetId, depth = 0) {
    assert.array(content, 'content');
    assert.nonEmptyString(targetId, 'targetId');
    if (content.some((block) => block.id === targetId)) return depth;
    for (const block of content) {
      if (block instanceof Bullet) {
        const found = BulletTreeOps.depthOf(block.children, targetId, depth + 1);
        if (found !== -1) return found;
      }
    }
    return -1;
  }
}
