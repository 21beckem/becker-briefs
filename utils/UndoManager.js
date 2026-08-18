import { assert } from './assert.js';

const TYPING_GROUP_DELAY_MS = 600;
const MAX_HISTORY = 100;

/**
 * UndoManager
 *
 * Tracks page-state snapshots (plain objects, as produced by
 * NotePage.toObject()) for undo/redo. Plain-text edits are grouped
 * into a single undo step per typing "burst" (committed after a
 * pause); every other kind of change (structural edits, type
 * changes, tag changes) is committed as its own immediate step, first
 * flushing any in-progress typing burst so it isn't silently merged
 * into the following step.
 *
 * This class knows nothing about DOM, models, or BriefsEditor --
 * it only deals in opaque snapshot objects handed to it, and reports
 * back via the injected onRestore callback when the caller should
 * apply a snapshot.
 */
export class UndoManager {
  #undoStack;
  #redoStack;
  #getSnapshot;
  #onRestore;
  #pendingTypingBaseline;
  #typingTimer;

  /**
   * @param {() => object} getSnapshot returns the current page state
   *   as a plain object
   * @param {(snapshot: object) => void} onRestore called with a
   *   snapshot that should become the current page state
   */
  constructor(getSnapshot, onRestore) {
    assert.function_(getSnapshot, 'getSnapshot');
    assert.function_(onRestore, 'onRestore');
    this.#getSnapshot = getSnapshot;
    this.#onRestore = onRestore;
    this.#undoStack = [];
    this.#redoStack = [];
    this.#pendingTypingBaseline = null;
    this.#typingTimer = null;
  }

  get canUndo() {
    return this.#pendingTypingBaseline !== null || this.#undoStack.length > 0;
  }

  get canRedo() {
    return this.#redoStack.length > 0;
  }

  /**
   * Call once per keystroke-level text edit, immediately after the
   * edit has already been applied to the live page state. Groups
   * consecutive calls (within the typing-pause window) into a single
   * eventual undo step.
   */
  recordTypingEdit() {
    if (this.#pendingTypingBaseline === null) {
      // The baseline is the state *before* this keystroke was applied,
      // which the caller must capture and pass in via beginTypingEdit.
      throw new Error('recordTypingEdit() called without an active typing baseline.');
    }
    if (this.#typingTimer !== null) clearTimeout(this.#typingTimer);
    this.#typingTimer = setTimeout(() => this.#flushTyping(), TYPING_GROUP_DELAY_MS);
  }

  /**
   * Call immediately before applying a keystroke-level text edit, but
   * only if there is not already a typing burst in progress. Captures
   * the pre-edit snapshot as the baseline for the eventual grouped
   * undo step.
   */
  beginTypingEditIfNeeded() {
    if (this.#pendingTypingBaseline === null) {
      this.#pendingTypingBaseline = this.#getSnapshot();
    }
  }

  #flushTyping() {
    if (this.#typingTimer !== null) {
      clearTimeout(this.#typingTimer);
      this.#typingTimer = null;
    }
    if (this.#pendingTypingBaseline === null) return;
    this.#pushUndo(this.#pendingTypingBaseline);
    this.#pendingTypingBaseline = null;
  }

  /**
   * Call immediately before applying any non-typing change
   * (structural, type, tag, collapse, page metadata). Flushes any
   * pending typing burst first, then commits this change's own
   * baseline as an immediate, separate undo step.
   */
  commitImmediateChange() {
    this.#flushTyping();
    this.#pushUndo(this.#getSnapshot());
  }

  #pushUndo(snapshot) {
    this.#undoStack.push(snapshot);
    if (this.#undoStack.length > MAX_HISTORY) this.#undoStack.shift();
    this.#redoStack = [];
  }

  /** Reverts to the previous undo step, if any. */
  undo() {
    if (this.#pendingTypingBaseline !== null) {
      if (this.#typingTimer !== null) clearTimeout(this.#typingTimer);
      this.#typingTimer = null;
      this.#redoStack.push(this.#getSnapshot());
      this.#onRestore(this.#pendingTypingBaseline);
      this.#pendingTypingBaseline = null;
      return;
    }
    if (this.#undoStack.length === 0) return;
    const snapshot = this.#undoStack.pop();
    this.#redoStack.push(this.#getSnapshot());
    this.#onRestore(snapshot);
  }

  /** Re-applies the most recently undone step, if any. */
  redo() {
    if (this.#redoStack.length === 0) return;
    const snapshot = this.#redoStack.pop();
    this.#undoStack.push(this.#getSnapshot());
    this.#onRestore(snapshot);
  }
}
