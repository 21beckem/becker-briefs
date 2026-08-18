import { assert } from './assert.js';

const EDGE_TOLERANCE_PX = 8;

/**
 * CaretNav
 *
 * Small heuristics for deciding whether ArrowUp/ArrowDown at the
 * current caret position should move within a (possibly multi-line,
 * wrapped) contenteditable element, or should instead jump to a
 * different line entirely. Used by BulletView and HeadingBlockView so
 * pressing Up on the first visual row (rather than anywhere in the
 * text) is what triggers cross-line navigation.
 */
export class CaretNav {
  /**
   * @param {HTMLElement} container
   * @returns {boolean}
   */
  static isAtFirstVisualLine(container) {
    assert.htmlElement(container, 'container');
    const caretRect = CaretNav.#caretRect(container);
    if (caretRect === null) return true;
    const containerRect = container.getBoundingClientRect();
    return caretRect.top - containerRect.top < EDGE_TOLERANCE_PX;
  }

  /**
   * @param {HTMLElement} container
   * @returns {boolean}
   */
  static isAtLastVisualLine(container) {
    assert.htmlElement(container, 'container');
    const caretRect = CaretNav.#caretRect(container);
    if (caretRect === null) return true;
    const containerRect = container.getBoundingClientRect();
    return containerRect.bottom - caretRect.bottom < EDGE_TOLERANCE_PX;
  }

  static #caretRect(container) {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length > 0) return rects[0];
    return null;
  }
}
