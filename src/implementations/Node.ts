export class Node<E> {
  constructor(public value: E, public next: Node<E> | null = null) {}
}
