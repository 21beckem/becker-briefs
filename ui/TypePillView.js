import { assert } from '../utils/assert.js';
import { TypeInstance } from '../models/TypeInstance.js';
import { TypeDefinition } from '../registries/TypeDefinition.js';
import { ModalView } from './ModalView.js';

/**
 * TypePillView
 *
 * Renders the generic chrome for a bullet's functional type: an icon
 * button (opens a ModalView if the definition supplies modal
 * content), whatever inline input element the definition supplies,
 * and a remove ('x') button. This class never knows what a 'todo' or
 * 'reminder' is -- all type-specific DOM (the checkbox, the
 * date-picker, the modal's contents) is built by the host's
 * TypeDefinition subclass and simply hosted here.
 */
export class TypePillView {
  #node;
  #typeInstance;
  #definition;
  #onDataChange;
  #onRemove;
  #modal;
  #iconButton;
  #inputSlot;

  /**
   * @param {TypeInstance} typeInstance
   * @param {TypeDefinition} definition the definition matching typeInstance.typeId
   * @param {(patch: object) => void} onDataChange
   * @param {() => void} onRemove called when the user clicks the remove button
   */
  constructor(typeInstance, definition, onDataChange, onRemove) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    assert.instanceOf(definition, TypeDefinition, 'definition');
    assert.function_(onDataChange, 'onDataChange');
    assert.function_(onRemove, 'onRemove');
    if (typeInstance.typeId !== definition.id)
      throw new Error('typeInstance.typeId does not match definition.id.');
    this.#typeInstance = typeInstance;
    this.#definition = definition;
    this.#onDataChange = onDataChange;
    this.#onRemove = onRemove;
    this.#modal = null;
    this.#node = this.#buildNode();
  }

  get node() {
    return this.#node;
  }

  /**
   * @returns {string} the typeId this pill is currently rendering,
   *   used by callers to decide whether an incoming TypeInstance can
   *   be applied via update() (same type, data changed) or requires a
   *   full rebuild (different type entirely).
   */
  get typeId() {
    return this.#typeInstance.typeId;
  }

  #buildNode() {
    const pill = document.createElement('span');
    pill.className = 'BRIEFS-type-pill';
    pill.style.border = `1px solid ${this.#definition.pillColors.border}`;
    pill.style.backgroundColor = this.#definition.pillColors.bg;

    const modalContent = this.#definition.createModalContent(
      this.#typeInstance,
      this.#onDataChange
    );

    const iconButton = document.createElement('button');
    iconButton.type = 'button';
    iconButton.className = 'BRIEFS-type-pill__icon';
    iconButton.textContent = this.#definition.getIcon(this.#typeInstance);
    iconButton.setAttribute('aria-label', this.#definition.label);
    if (modalContent !== null) {
      assert.htmlElement(modalContent, 'result of createModalContent');
      iconButton.addEventListener('mousedown', (event) => event.preventDefault());
      iconButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#openModal(modalContent);
      });
    } else {
      iconButton.classList.add('BRIEFS-type-pill__icon--static');
    }
    this.#iconButton = iconButton;
    pill.appendChild(iconButton);

    this.#inputSlot = document.createElement('span');
    this.#inputSlot.className = 'BRIEFS-type-pill__input-slot';
    this.#renderInputElement();
    pill.appendChild(this.#inputSlot);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'BRIEFS-type-pill__remove';
    removeButton.setAttribute('aria-label', `Remove ${this.#definition.label}`);
    removeButton.textContent = '\u00d7';
    removeButton.addEventListener('mousedown', (event) => event.preventDefault());
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#onRemove();
    });
    pill.appendChild(removeButton);

    return pill;
  }

  #renderInputElement() {
    this.#inputSlot.textContent = '';
    const inputElement = this.#definition.createInputElement(this.#typeInstance, this.#onDataChange);
    if (inputElement !== null) {
      assert.htmlElement(inputElement, 'result of createInputElement');
      inputElement.addEventListener('mousedown', (event) => event.stopPropagation());
      this.#inputSlot.appendChild(inputElement);
    }
  }

  /**
   * Refreshes this pill's icon and input element to reflect a new
   * TypeInstance of the *same* type (data changed, not the type
   * itself). Deliberately does not touch an open modal, if any --
   * only the caller (definition.createModalContent's own onDataChange
   * wiring) updates what the modal shows.
   * @param {TypeInstance} typeInstance
   */
  update(typeInstance) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    if (typeInstance.typeId !== this.#definition.id)
      throw new Error('update() cannot change a pill to a different type; rebuild it instead.');
    this.#typeInstance = typeInstance;
    this.#iconButton.textContent = this.#definition.getIcon(this.#typeInstance);
    this.#renderInputElement();
  }

  #openModal(contentNode) {
    this.#modal = new ModalView(contentNode, () => {
      this.#modal = null;
    });
    this.#modal.open();
  }

  destroy() {
    if (this.#modal !== null) this.#modal.destroy();
    this.#node.remove();
  }
}
