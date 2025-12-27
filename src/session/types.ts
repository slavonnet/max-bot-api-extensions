export interface SessionStore {
  get(sessionKey: string): Promise<any> | any;
  set(sessionKey: string, value: any): Promise<void> | void;
  delete(sessionKey: string): Promise<void> | void;
}

export interface SessionOptions {
  store: SessionStore;
  defaultSession?: () => any;
  getSessionKey?: (ctx: any) => string;
}

