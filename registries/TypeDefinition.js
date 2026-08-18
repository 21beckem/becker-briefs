import { assert } from '../utils/assert.js';
import * as Utils from '../utils/Utils.js';
import { TypeInstance } from '../models/TypeInstance.js';

class PillColors {
  #bg;
  #border;
  constructor(bg, border) {
    assert.nonEmptyString(bg, 'bg');
    assert.nonEmptyString(border, 'border');
    this.#bg = bg;
    this.#border = border;
  }
  static fromBorderHex(hex) {
    assert.nonEmptyString(hex, 'hex');
    return new PillColors(
      Utils.hexColorToTintedWhite(hex, 0.65, 0.2),
      Utils.hexColorToTintedWhite(hex, 0, 0.5)
    )
  }
  get bg() { return this.#bg; }
  get border() { return this.#border; }
}

/**
 * TypeDefinition
 *
 * Abstract base class. The host application subclasses this once per
 * functional bullet type (todo, reminder, question, ...) and passes
 * instances into a TypeRegistry. This is the entire extension point
 * for "tags that unlock behavior" -- briefs itself ships with zero
 * concrete types.
 *
 * Unlike an earlier version of this class, the host now owns the
 * actual DOM for its type's pill contents (the inline input element,
 * and optionally a modal's content) rather than briefs guessing at
 * a fixed set of "kinds" like checkbox/icon. briefs only owns the
 * generic pill chrome (the icon button, the remove button, and the
 * modal dialog itself) -- see TypePillView and ModalView.
 *
 * Subclasses MUST override createDefaultData, validateData, getIcon,
 * and createInputElement. This base class throws if any are called
 * directly, so a subclass that forgets to override one fails loudly.
 */
export class TypeDefinition {
  #id;
  #label;
  #colors;

  /**
   * @param {string} id unique identifier, e.g. 'todo'
   * @param {string} label human-readable display name, e.g. 'To-do'
   */
  constructor(id, label, pillColors) {
    if (new.target === TypeDefinition)
      throw new TypeError('TypeDefinition is abstract and cannot be instantiated directly.');
    assert.nonEmptyString(id, 'id');
    assert.nonEmptyString(label, 'label');
    assert.instanceOf(pillColors, PillColors, 'pillColors');
    this.#id = id;
    this.#label = label;
    this.#colors = pillColors;
  }

  static get PillColors() { return PillColors; }

  get id() { return this.#id; }
  get label() { return this.#label; }
  get pillColors() { return this.#colors; }

  /**
   * Builds the initial `data` object for a brand-new TypeInstance of
   * this type. Must be overridden by subclasses.
   * @returns {object}
   */
  createDefaultData() {
    throw new Error(`${this.constructor.name}.createDefaultData() is not implemented.`);
  }

  /**
   * Throws if `data` is not a valid payload for this type. Must be
   * overridden by subclasses.
   * @param {object} data
   */
  validateData(data) {
    throw new Error(`${this.constructor.name}.validateData() is not implemented.`);
  }

  /**
   * A short emoji/icon string shown on the pill. Must be overridden.
   * @param {TypeInstance} typeInstance
   * @returns {string}
   */
  getIcon(typeInstance) {
    throw new Error(`${this.constructor.name}.getIcon() is not implemented.`);
  }

  /**
   * Creates the pill's inline input element (a checkbox, a
   * date-picker, a button, whatever this type needs) fully built and
   * wired by the host. Return null if this type has no inline input.
   * Must be overridden.
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange call with a partial
   *   data patch whenever the user interacts with the element
   * @returns {HTMLElement|null}
   */
  createInputElement(typeInstance, onDataChange) {
    throw new Error(`${this.constructor.name}.createInputElement() is not implemented.`);
  }

  /**
   * Optionally creates the content node shown in a modal dialog when
   * the pill's icon is clicked. briefs's ModalView owns the actual
   * dialog chrome (backdrop, close button, escape-to-close) -- this
   * method only supplies what goes inside it. Default: no modal.
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange
   * @returns {HTMLElement|null}
   */
  createModalContent(typeInstance, onDataChange) {
    return null;
  }

  /**
   * Whether a bullet carrying this TypeInstance should render its
   * text struck through. Default: never.
   * @param {TypeInstance} typeInstance
   * @returns {boolean}
   */
  isStrikethrough(typeInstance) {
    return false;
  }

  /**
   * Convenience helper: builds a fresh TypeInstance of this type with
   * default data.
   * @returns {TypeInstance}
   */
  createInstance() {
    return new TypeInstance(this.#id, this.createDefaultData());
  }
}
