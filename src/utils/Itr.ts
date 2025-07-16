export class Itr<E> {
  private cursor: number = 0;
  private lastRet: number = -1;
  private expectedModCount: number = 0;

  constructor(private list: any) {}
}
