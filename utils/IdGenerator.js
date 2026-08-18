/**
 * IdGenerator
 *
 * Tiny wrapper around the platform's random-id capability so the rest
 * of the module never calls crypto.randomUUID (or a fallback) inline.
 */
export class IdGenerator {
  /**
   * @param {string} prefix optional short prefix, e.g. 'bullet'
   * @returns {string}
   */
  static generate(prefix = '') {
    const raw =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return prefix.length > 0 ? `${prefix}-${raw}` : raw;
  }
}
