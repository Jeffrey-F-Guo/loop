export interface ViewProps<C> {
  viewId: string;
  config: C;
  setConfig: (config: C) => void;
}
