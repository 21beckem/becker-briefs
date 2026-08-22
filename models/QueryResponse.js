import { BriefSummary } from './BriefSummary.js';
import { assert } from '../utils/assert.js';

export class QueryResponse {
  #results;
  #totalCount;

  constructor(results, totalCount) {
    assert.arrayOf(results, BriefSummary, 'results');
    assert.integerInRange(totalCount, 'totalCount', 0, Number.MAX_SAFE_INTEGER);

    this.#results = [...results];
    this.#totalCount = totalCount;
  }

  get results() {
    return [...this.#results];
  }

  get totalCount() {
    return this.#totalCount;
  }

  static fromObject(obj) {
    assert.plainObject(obj, 'obj');
    assert.array(obj.results, 'obj.results');
    const results = obj.results.map((result) => BriefSummary.fromObject(result));
    return new QueryResponse(results, obj.totalCount);
  }
}