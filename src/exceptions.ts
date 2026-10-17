// `name` is set explicitly (not from constructor.name) so it survives minification.

export class RuntimeException extends Error {
  override name = 'RuntimeException';
}

export class IndexOutOfBoundsException extends RuntimeException {
  override name = 'IndexOutOfBoundsException';
}

export class ArrayIndexOutOfBoundsException extends IndexOutOfBoundsException {
  override name = 'ArrayIndexOutOfBoundsException';
}

export class NoSuchElementException extends RuntimeException {
  override name = 'NoSuchElementException';
}

export class EmptyStackException extends RuntimeException {
  override name = 'EmptyStackException';
}

export class NullPointerException extends RuntimeException {
  override name = 'NullPointerException';
}

export class IllegalArgumentException extends RuntimeException {
  override name = 'IllegalArgumentException';
}

export class IllegalStateException extends RuntimeException {
  override name = 'IllegalStateException';
}

export class UnsupportedOperationException extends RuntimeException {
  override name = 'UnsupportedOperationException';
}

export class ConcurrentModificationException extends RuntimeException {
  override name = 'ConcurrentModificationException';
}

export class ClassCastException extends RuntimeException {
  override name = 'ClassCastException';
}
