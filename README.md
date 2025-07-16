# TS Collections Framework

A TypeScript implementation of a robust and extensible collections framework, inspired by common data structure libraries. This project aims to provide a set of highly performant and easy-to-use data structures like Lists, Queues, and more, all written in TypeScript with strong type safety.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **TypeScript Native:** Built from the ground up with TypeScript for excellent type safety and developer experience.
- **Common Data Structures:** Provides implementations for fundamental data structures like `ArrayList`, `LinkedList`, and `Queue`.
- **Extensible Architecture:** Designed with abstract classes and interfaces, allowing for easy extension and creation of new collection types.
- **Iterator Support:** Comprehensive iterator support for traversing collections.
- **Serialization & Cloning:** Interfaces for making collections serializable and cloneable.
- **Custom Comparators:** Support for custom comparison logic through `IComparator`.

## Installation

To install the TS Collections Framework, you can use npm or yarn:

```bash
npm install ts-collections-framework
# or
yarn add ts-collections-framework
```

Usage
-----

Here are some basic examples of how to use the collections:

### ArrayList

TypeScript

```bash
import { ArrayList } from 'ts-collections-framework/implementations/ArrayList';

const myList = new ArrayList<string>();
myList.add('Hello');
myList.add('World');
myList.add('!');

console.log(myList.size()); // Output: 3
console.log(myList.get(0)); // Output: Hello

myList.remove('World');
console.log(myList.toArray()); // Output: ['Hello', '!']
```

### LinkedList

TypeScript

```bash
import { LinkedList } from 'ts-collections-framework/implementations/LinkedList';

const myLinkedList = new LinkedList<number>();
myLinkedList.add(10);
myLinkedList.add(20);
myLinkedList.add(30);

console.log(myLinkedList.get(1)); // Output: 20

myLinkedList.removeAt(0);
console.log(myLinkedList.toArray()); // Output: [20, 30]

```

### Queue

TypeScript

```bash
import { Queue } from 'ts-collections-framework/implementations/Queue';

const myQueue = new Queue<string>();
myQueue.offer('First');
myQueue.offer('Second');

console.log(myQueue.peek()); // Output: First
console.log(myQueue.poll()); // Output: First
console.log(myQueue.poll()); // Output: Second
console.log(myQueue.isEmpty()); // Output: true
```

Project Structure
-----------------

The project is organized into several key directories:

```
ts-collections-framework/src
├── abstracts/             # Abstract base classes for collections, lists, etc.
│   ├── AbstractCollection.ts
│   ├── AbstractList.ts
│   └── AbstractSequentialList.ts
├── exceptions/            # Custom exception classes for collection operations.
│   └── exceptions.ts
├── implementations/       # Concrete implementations of data structures.
│   ├── ArrayList.ts
│   ├── LinkedList.ts
│   ├── Node.ts            # Helper class for linked list implementations.
│   └── Queue.ts
├── interfaces/            # TypeScript interfaces defining collection contracts and behaviors.
│   ├── ICloneable.ts
│   ├── ICollection.ts
│   ├── IComparator.ts
│   ├── IIterable.ts
│   ├── IIterator.ts
│   ├── Ilist.ts
│   ├── IListIterator.ts
│   ├── IQueue.ts
│   ├── IRandomAccess.ts
│   ├── ISerializable.ts
│   ├── ISequencedCollection.ts
│   ├── ISpliterator.ts
│   ├── IUnaryOperator.ts
│   └── Override.ts
└── utils/                 # Utility classes and helper functions.
    ├── Iterator.ts
    └── Itr.ts
```

-   **`abstracts/`**: Contains abstract classes that provide common functionality and serve as a base for concrete collection implementations. This promotes code reusability and a consistent API.

-   **`exceptions/`**: Defines custom exceptions that might be thrown during collection operations (e.g., `IndexOutOfBoundsException`).

-   **`implementations/`**: Houses the actual data structure implementations, such as `ArrayList`, `LinkedList`, and `Queue`.

-   **`interfaces/`**: This directory is crucial, defining the contracts for various collection types, iterators, comparators, and other essential behaviors.

-   **`utils/`**: Provides utility classes or helper functions that support the core collection functionalities, such as iterators.

Contributing
------------

Contributions are welcome! If you have any ideas, bug reports, or feature requests, please open an issue or submit a pull request.

License
-------

This project is licensed under the [MIT License](https://www.google.com/search?q=LICENSE).