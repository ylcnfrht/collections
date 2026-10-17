// Runs the contracts against the test-only array-backed implementations, validating
// the abstract classes (and the contracts themselves) independently of real collections.
import { collectionContract } from './contracts/collection';
import { listContract } from './contracts/list';
import { AbstractList } from '../src/abstract/AbstractList';
import { expectThrows } from './helpers';
import { SimpleList, SimpleSeqList } from './support';

collectionContract('AbstractList(SimpleList)', () => new SimpleList(), { allowsNull: true, allowsDuplicates: true });
listContract('AbstractList(SimpleList)', () => new SimpleList());

collectionContract('AbstractSequentialList(SimpleSeqList)', () => new SimpleSeqList(), { allowsNull: true, allowsDuplicates: true });
listContract('AbstractSequentialList(SimpleSeqList)', () => new SimpleSeqList());

import { mapContract } from './contracts/map';
import { setContract } from './contracts/set';
import { SimpleMap, SimpleSet } from './support';

collectionContract('AbstractSet(SimpleSet)', () => new SimpleSet(), { allowsNull: true, allowsDuplicates: false });
setContract('AbstractSet(SimpleSet)', () => new SimpleSet(), { skipScale: true });
mapContract('AbstractMap(SimpleMap)', () => new SimpleMap(), { allowsNullKey: true, allowsNullValue: true, skipScale: true });

describe('AbstractList · ListIterator.add on an unmodifiable list', () => {
  class ReadOnly extends AbstractList<number> {
    get(i: number): number {
      return [1, 2][i];
    }
    size(): number {
      return 2;
    }
  }
  it('add throws UnsupportedOperationException and the cursor stays put', () => {
    const it = new ReadOnly().listIterator();
    expectThrows(() => it.add(9), 'UnsupportedOperationException');
    expect([it.nextIndex(), it.next()]).toEqual([0, 1]);
  });
  it('add(e) / set on the list throw UnsupportedOperationException', () => {
    expectThrows(() => new ReadOnly().add(3), 'UnsupportedOperationException');
    expectThrows(() => new ReadOnly().set(0, 3), 'UnsupportedOperationException');
  });
});
