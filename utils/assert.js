/**
 * assert.js
 *
 * A small collection of static validation guards used throughout the
 * briefs module. Every constructor in this project calls into these
 * rather than hand-rolling its own `if (...) throw` checks, so the
 * validation style (and error messages) stay consistent everywhere.
 *
 * This file has zero dependencies and never reaches outside itself.
 */
export class assert {
  /**
   * @param {*} value
   * @param {string} name
   */
  static string(value, name) {
    if (typeof value !== 'string')
      throw new TypeError(`${name} must be a string.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static nonEmptyString(value, name) {
    assert.string(value, name);
    if (value.trim().length === 0)
      throw new TypeError(`${name} must not be empty.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static stringOrNull(value, name) {
    if (value === null) return;
    assert.string(value, name);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static integer(value, name) {
    if (!Number.isInteger(value))
      throw new TypeError(`${name} must be an integer.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   * @param {number} min
   * @param {number} max
   */
  static integerInRange(value, name, min, max) {
    assert.integer(value, name);
    if (value < min || value > max)
      throw new RangeError(`${name} must be between ${min} and ${max}.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static boolean(value, name) {
    if (typeof value !== 'boolean')
      throw new TypeError(`${name} must be a boolean.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static plainObject(value, name) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new TypeError(`${name} must be a plain object.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static plainObjectOrNull(value, name) {
    if (value === null) return;
    assert.plainObject(value, name);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static array(value, name) {
    if (!Array.isArray(value))
      throw new TypeError(`${name} must be an array.`);
  }

  /**
   * @param {*} value
   * @param {Function} Klass
   * @param {string} name
   */
  static instanceOf(value, Klass, name) {
    if (!(value instanceof Klass))
      throw new TypeError(`${name} must be an instance of ${Klass.name}.`);
  }

  /**
   * @param {*} value
   * @param {Function} Klass
   * @param {string} name
   */
  static instanceOfOrNull(value, Klass, name) {
    if (value === null) return;
    assert.instanceOf(value, Klass, name);
  }

  /**
   * @param {*} value
   * @param {Function} Klass
   * @param {string} name
   */
  static arrayOf(value, Klass, name) {
    assert.array(value, name);
    value.forEach((item, index) => {
      if (!(item instanceof Klass))
        throw new TypeError(
          `${name}[${index}] must be an instance of ${Klass.name}.`
        );
    });
  }

  /**
   * @param {*} value
   * @param {Function} Klass
   * @param {string} name
   */
  static arrayOfStrings(value, name) {
    assert.array(value, name);
    value.forEach((item, index) => {
      if (typeof item !== 'string')
        throw new TypeError(
          `${name}[${index}] must be a string.`
        );
    });
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static function_(value, name) {
    if (typeof value !== 'function')
      throw new TypeError(`${name} must be a function.`);
  }

  /**
   * @param {*} value
   * @param {string} name
   */
  static functionOrNull(value, name) {
    if (value === null) return;
    assert.function_(value, name);
  }

  /**
   * @param {*} value
   * @param {Function} Klass
   * @param {string} name
   */
  static htmlElement(value, name) {
    if (!(value instanceof HTMLElement))
      throw new TypeError(`${name} must be an HTMLElement.`);
  }
}
