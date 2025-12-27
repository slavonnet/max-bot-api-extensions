export type SceneHandler<TContext = any> = (ctx: TContext) => Promise<any> | any;

export interface SceneOptions {
  ttl?: number;
}

export interface StageOptions {
  ttl?: number;
}

