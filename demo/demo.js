import { BriefsEditor } from '../BriefsEditor.js';
import { NotePage } from '../models/NotePage.js';
import { HeadingBlock } from '../models/HeadingBlock.js';
import { Bullet } from '../models/Bullet.js';
import { RichText } from '../models/RichText.js';
import { Tag } from '../models/Tag.js';
import { TypeInstance } from '../models/TypeInstance.js';
import { TypeRegistry } from '../registries/TypeRegistry.js';
import { TagRegistry } from '../registries/TagRegistry.js';
import { PersistenceAdapter } from '../persistence/PersistenceAdapter.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { TodoType } from './TodoType.js';
import { ScheduleType } from './ScheduleType.js';
import { assert } from '../utils/assert.js';
import { BriefsCollection } from '../BriefsCollection.js';
import { Query } from '../models/Query.js';

const STORAGE_KEY = 'briefs-demo:page';

const typeRegistry = TypeRegistry.fromArray([TodoType, ScheduleType]);


const tagRegistry = TagRegistry.fromObject({
  initialTags: [
    new Tag('tag-82ec0e1e-442d-4adf-bdd3-d09f9612e604', 'math class', '#3A5A6B'),
    new Tag('tag-33e692b6-c22a-4e78-b619-c2b44c13cebc', 'devotional', '#6B4C9A'),
  ],
  onCreateTag: (label) =>
    Tag.fromObject({
      id: IdGenerator.generate('tag'),
      label
    })
});



const persistenceAdapter = PersistenceAdapter.fromObject({
  onSave: (pageObject) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pageObject));
  },
  onLoad: (pageId) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return JSON.parse(raw);
    return buildSeedPage(pageId).toObject();
  }
});


const onQuery = async (query) => {
  assert.instanceOf(query, Query, 'query');
  
  // contact the api to get results, just an example below:
  return Query.responseFromObject({
    results: [{
      id: '1',
      name: 'Sample Brief',
      snippet: 'This is a sample brief.',
      date: new Date(),
      tagIds: ['tag1', 'tag2']
    }],
    totalCount: 0
  });
  const response = await fetch(url);
  const data = await response.json();

  return Query.responseFromObject(data);
};


BriefsCollection.fromObject({
  container: document.getElementById('briefs-container'),
  onQuery,
  layout: BriefsCollection.layouts.USER_PREFERENCE,
  initialQuery: Query.fromWindowSearchParams(),
  briefLaunchMode: BriefsCollection.briefLaunchModes.USER_PREFERENCE,
  head: document.head,
  typeRegistry,
  tagRegistry,
  persistenceAdapter,
});