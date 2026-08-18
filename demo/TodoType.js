import { assert } from '../utils/assert.js';
import { TypeDefinition } from '../registries/TypeDefinition.js';
import { TypeInstance } from '../models/TypeInstance.js';

/**
 * TodoType
 *
 * The demo host application's own definition of a 'todo' functional
 * type. This class lives outside the briefs module on purpose --
 * it is exactly the kind of thing a real host app would author for
 * itself and hand to a TypeRegistry at construction time. It owns all
 * of its own DOM: the inline checkbox, and a small modal for setting
 * a due date.
 */
export class TodoType extends TypeDefinition {
  constructor() { 
    super('todo', 'ToDo', TypeDefinition.PillColors.fromBorderHex('#fcba03'));
  }

  /**
   * @returns {object}
   */
  createDefaultData() {
    return { completed: false, dueDate: null };
  }

  /**
   * @param {object} data
   */
  validateData(data) {
    assert.plainObject(data, 'data');
    assert.boolean(data.completed, 'data.completed');
    assert.stringOrNull(data.dueDate, 'data.dueDate');
  }

  /**
   * @param {TypeInstance} typeInstance
   * @returns {string}
   */
  getIcon(typeInstance) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    return typeInstance.data.dueDate !== null ? '\ud83d\udcc5' : '\u2713';
  }

  /**
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange
   * @returns {HTMLElement}
   */
  createInputElement(typeInstance, onDataChange) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    assert.function_(onDataChange, 'onDataChange');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'BRIEFS-todo-checkbox';
    checkbox.checked = Boolean(typeInstance.data.completed);
    checkbox.setAttribute('aria-label', 'Mark complete');
    checkbox.addEventListener('change', () => {
      onDataChange({ completed: checkbox.checked });
    });
    return checkbox;
  }

  /**
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange
   * @returns {HTMLElement}
   */
  createModalContent(typeInstance, onDataChange) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    assert.function_(onDataChange, 'onDataChange');
    const wrapper = document.createElement('div');
    wrapper.className = 'BRIEFS-todo-modal';

    const heading = document.createElement('h3');
    heading.textContent = 'To-do details';
    wrapper.appendChild(heading);

    const label = document.createElement('label');
    label.className = 'BRIEFS-todo-modal__label';
    label.textContent = 'Due date';
    wrapper.appendChild(label);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'BRIEFS-todo-modal__date';
    dateInput.value = typeInstance.data.dueDate ?? '';
    dateInput.addEventListener('change', () => {
      onDataChange({ dueDate: dateInput.value.length > 0 ? dateInput.value : null });
    });
    label.appendChild(dateInput);

    return wrapper;
  }

  /**
   * @param {TypeInstance} typeInstance
   * @returns {boolean}
   */
  isStrikethrough(typeInstance) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    return Boolean(typeInstance.data.completed);
  }
}
