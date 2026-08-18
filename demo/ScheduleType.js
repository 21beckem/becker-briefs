import { assert } from '../utils/assert.js';
import * as Utils from '../utils/Utils.js';
import { TypeDefinition } from '../registries/TypeDefinition.js';
import { TypeInstance } from '../models/TypeInstance.js';

let lastAppointmentId = 0;
export class ScheduleType extends TypeDefinition {
  constructor() { 
    super('schedule', 'Schedule', TypeDefinition.PillColors.fromBorderHex('#8403fc'));
  }

  /**
   * @returns {object}
   */
  createDefaultData() {
    lastAppointmentId++;
    return { appointmentId: lastAppointmentId };
  }

  /**
   * @param {object} data
   */
  validateData(data) {
    assert.plainObject(data, 'data');
    assert.integer(appointmentId, 'appointmentId');
  }

  /**
   * @param {TypeInstance} typeInstance
   * @returns {string}
   */
  getIcon(typeInstance) {
    console.log('geticon', typeInstance);
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    return '\ud83d\udcc5';
  }

  /**
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange
   * @returns {HTMLElement}
   */
  createInputElement(typeInstance, onDataChange) {
    return null;
  }

  /**
   * @param {TypeInstance} typeInstance
   * @param {(patch: object) => void} onDataChange
   * @returns {HTMLElement}
   */
  createModalContent(typeInstance, onDataChange) {
    assert.instanceOf(typeInstance, TypeInstance, 'typeInstance');
    assert.function_(onDataChange, 'onDataChange');

    const node = Utils.buildDOM(['div', { 'class': 'BRIEFS-todo-modal' },
      ['h3', 'Schedule details'],
      ['label', { 'class': 'BRIEFS-todo-modal__label' }, 'Appointment Id'],
      ['input', {
        'class': 'BRIEFS-todo-modal__date',
        'type': 'text',
        'value': String(typeInstance.data.appointmentId)
      }],
    ]);
    node.querySelector('input').addEventListener('change', (e) => {
      onDataChange({ appointmentId: parseInt(e.target.value, 10) });
    });

    return node;
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
