/**
 * BriefsEvents.js
 *
 * Frozen set of CustomEvent name constants used internally by the
 * briefs module. Using constants instead of raw strings avoids
 * typo-prone magic strings scattered across files. These events are
 * dispatched on the DOM node of the view that changed and bubble up
 * to whichever ancestor is listening (usually BriefsEditor).
 */
export const BriefsEvents = Object.freeze({
  /**
   * A bullet's text, type, tags, or collapse state changed. detail:
   * { bulletId, kind: 'text'|'type'|'tag'|'collapse', updater }.
   * `kind` tells BriefsEditor whether this should be grouped into
   * the current typing-undo-burst ('text') or committed as its own
   * immediate undo step (anything else).
   */
  BULLET_CHANGED: 'briefs:bullet-changed',
  /**
   * A heading's text changed. detail: { blockId, kind: 'text', updater }.
   */
  HEADING_CHANGED: 'briefs:heading-changed',
  /** The overall page metadata changed (name, date, page-level tags). */
  PAGE_CHANGED: 'briefs:page-changed',
  /** A line (bullet or heading) gained keyboard focus. detail: { lineId }. */
  LINE_FOCUSED: 'briefs:line-focused',
  /** Fired by MobileActionBar when the user taps/selects an action. */
  ACTION_REQUESTED: 'briefs:action-requested',
  /**
   * A structural change to the outline tree was requested (indent,
   * outdent, new sibling, delete, move-up, move-down, convert-to, ...).
   * Requires sibling/parent awareness the originating line does not
   * have, so it is always handled at the BriefsEditor level against
   * the full NotePage tree, followed by a re-render.
   */
  STRUCTURAL_ACTION: 'briefs:structural-action',
  /**
   * ArrowUp/ArrowDown at a line boundary requesting focus move to the
   * previous/next line in document order. detail: { lineId, direction }.
   */
  NAVIGATE_REQUESTED: 'briefs:navigate-requested',
});
