import assert from 'node:assert/strict';
import test from 'node:test';
import { JOURNEY_SAVE_KEY, JourneyPersistence, parseJourneySave } from '../src/journey.ts';
import type { StorageLike } from '../src/quest.ts';

class Store implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key,value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('walking before the first delivery restores exploration and completed onboarding independently', () => {
  const store = new Store(), journey = new JourneyPersistence(store);
  journey.completeIntro();journey.savePose([10,12,0],[0,0,-1]);
  const reloaded = new JourneyPersistence(store);
  assert.equal(reloaded.hasProgress,true);assert.equal(reloaded.introCompleted,true);
  assert.deepEqual(reloaded.pose,{position:[10,12,0],forward:[0,0,-1]});
  const copied = reloaded.pose!;copied.position[0] = 999;
  assert.equal(reloaded.pose!.position[0],10);
});

test('a position saved during arrival does not mark an unfinished introduction complete', () => {
  const store = new Store(), journey = new JourneyPersistence(store);
  journey.savePose([10,12,0],[0,0,-1]);
  assert.equal(new JourneyPersistence(store).introCompleted,false);
});

test('deployed v1 poses migrate and survive another save without replaying onboarding', () => {
  const store = new Store();
  store.setItem(JOURNEY_SAVE_KEY,JSON.stringify({version:1,position:[12,10,0],forward:[0,0,1]}));
  const journey = new JourneyPersistence(store);assert.equal(journey.introCompleted,true);
  journey.savePose([12,10,1],[0,0,1]);
  assert.equal(JSON.parse(store.getItem(JOURNEY_SAVE_KEY)!).version,2);
  assert.equal(new JourneyPersistence(store).introCompleted,true);
});

test('corrupt or unsupported poses never become resumable journeys', () => {
  for (const raw of ['broken','[]','null',JSON.stringify({version:9,position:[0,10,0],forward:[0,0,1]}),
    JSON.stringify({version:1,position:[0,10,0],forward:[0,0,0]}),
    JSON.stringify({version:1,position:[0,10,0],forward:[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]}),
    JSON.stringify({version:1,position:[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE],forward:[0,0,1]}),
    JSON.stringify({version:2,introCompleted:true,pose:{position:[0,10],forward:[0,0,1]}}),
    JSON.stringify({version:2,introCompleted:'true',pose:null})]) assert.equal(parseJourneySave(raw),null);
});

test('restart clears exploration and tutorial together, while blocked storage stays playable', () => {
  const store = new Store(), journey = new JourneyPersistence(store);
  journey.completeIntro();journey.savePose([10,12,0],[0,0,1]);journey.restart();
  assert.equal(journey.hasProgress,false);assert.equal(new JourneyPersistence(store).introCompleted,false);
  const blocked: StorageLike = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const inMemory = new JourneyPersistence(blocked);inMemory.completeIntro();
  assert.equal(inMemory.introCompleted,true);assert.equal(inMemory.persistenceAvailable,false);
  assert.doesNotThrow(() => inMemory.restart());assert.equal(inMemory.hasProgress,false);
});
