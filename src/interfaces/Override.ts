export type Override<
  T,
  K extends
    | {
        [P in keyof T]: any;
      }
    | string
> = K extends string ? Omit<T, K> : Omit<T, keyof K> & K;
