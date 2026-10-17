// Runs the contracts against the test-only array-backed implementations, validating
// the abstract classes (and the contracts themselves) independently of real collections.
import { collectionContract } from './contracts/collection';
import { listContract } from './contracts/list';
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
