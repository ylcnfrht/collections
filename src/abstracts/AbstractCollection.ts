import { UnsupportedOperationException } from '../exceptions/exceptions';
import { ICollection } from '../interfaces/ICollection';

export abstract class AbstractCollection<E> implements ICollection<E> {
  protected items: E[] = [];
  protected constructor() {}

  // public abstract iterator(): IIterator<E>;
  public abstract size(): number;

  public isEmpty(): boolean {
    return this.size() === 0;
  }

  public contains(o: any): boolean {
    return this.items.includes(o);
  }

  public toArray(): any[] {
    return [...this.items];
  }

  public add(e: E): boolean {
    throw new UnsupportedOperationException();
  }

  public addAll(c: ICollection<E>): boolean;
  public addAll(index: number, c: ICollection<E>): boolean;
  public addAll(arg1: any, arg2?: any): boolean {
    if (typeof arg1 === 'number' && arg2) {
      throw new UnsupportedOperationException(
        'Indexed addAll is not supported'
      );
    } else if (arg1) {
      const c: ICollection<E> = arg1;
      let modified = false;
      for (const e of c.toArray()) {
        if (this.add(e)) {
          modified = true;
        }
      }
      return modified;
    }
    return false;
  }

  // public remove(): boolean;
  public remove(o: E): boolean {
    const originalSize: number = this.size();

    this.items = this.items.filter((item) => item !== o);

    return originalSize !== this.size();
  }

  removeAll(c: ICollection<E>): boolean {
    const originalSize = this.size();

    const itemsToRemove = new Set(c.toArray());

    this.items = this.items.filter((item) => !itemsToRemove.has(item));

    return originalSize !== this.size();
  }

  public containsAll(c: ICollection<E>): boolean {
    return c.toArray().every((item) => this.items.includes(item));
  }

  public retainAll(c: ICollection<E>): boolean {
    if (!c) throw new Error('Collection cannot be null');

    let modified = false;

    const toRetain = this.items.filter((item) => {
      const shouldRetain = [...c.toArray()].includes(item);
      if (!shouldRetain) {
        this.remove(item);
        modified = true;
      }
      return shouldRetain;
    });

    this.items = toRetain;

    return modified;
  }

  public clear(): void {
    this.items = [];
  }

  public toString(): string {
    return `[${this.items.join(', ')}]`;
  }

  public forEach(action: (item: E) => void): void {
    for (const item of this.items) {
      action(item);
    }
  }

  public removeIf(filter: (item: E) => boolean): boolean {
    const originalSize = this.size();

    this.items = this.items.filter((item) => !filter(item));

    return originalSize !== this.size();
  }

  public equals(other: any): boolean {
    if (this === other) return true;
    if (!(other instanceof AbstractCollection)) return false;
    const otherCollection = other as AbstractCollection<E>;
    if (this.size() !== otherCollection.size()) return false;

    return this.items.every(
      (item, index) =>
        item === otherCollection.items[index] ||
        (item !== null && this.equals(otherCollection.items[index]))
    );
  }

  public hashCode(): number {
    return this.items.reduce((hash, item) => {
      const itemHash = item !== null ? this.hashCode() : 0;
      return 31 * hash + itemHash;
    }, 1);
  }
}
