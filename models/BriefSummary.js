import { assert } from '../utils/assert.js';

export class BriefSummary {
  #id;
  #name;
  #snippet;
  #date;
  #tagIds;

  constructor(id, name, snippet, date, tagIds) {
    assert.nonEmptyString(id, 'id');
    assert.stringOrNull(name, 'name');
    assert.stringOrNull(snippet, 'snippet');
    assert.instanceOf(date, Date, 'date');
    assert.arrayOfStrings(tagIds, 'tagIds');

    this.#id = id;
    this.#name = name;
    this.#snippet = snippet;
    this.#date = date;
    this.#tagIds = [...tagIds];
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  get snippet() {
    return this.#snippet;
  }

  get date() {
    return this.#date;
  }

  get tagIds() {
    return [...this.#tagIds];
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    const date = obj.date instanceof Date ? obj.date : new Date(obj.date);
    return new BriefSummary(
      obj.id,
      obj.name === undefined ? null : obj.name,
      obj.snippet === undefined ? null : obj.snippet,
      date,
      Array.isArray(obj.tags) ? obj.tags : []
    );
  }
}