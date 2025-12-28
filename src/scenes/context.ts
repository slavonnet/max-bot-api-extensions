import { BaseScene } from './base-scene';

// Интерфейс для данных сцены в сессии
export interface SceneSessionData {
  current?: string;
  expires?: number;
  state?: object;
}

// Интерфейс для сессии со сценами
export interface SceneSession<S extends SceneSessionData = SceneSessionData> {
  __scenes?: S;
  // Для обратной совместимости - если используется просто scene вместо __scenes
  scene?: string;
}

// Опции для SceneContextScene
export interface SceneContextSceneOptions<D extends SceneSessionData> {
  ttl?: number;
  default?: string;
  defaultSession: D;
}

// Интерфейс для SceneContextScene
export interface SceneContextScene<TContext = any> {
  enter(sceneId: string, initialState?: object, silent?: boolean): Promise<void>;
  leave(): Promise<void>;
  reenter(): Promise<void>;
  readonly current: BaseScene<TContext> | undefined;
  reset(): void;
  get session(): SceneSessionData;
  get state(): object;
  set state(value: object);
}

// Класс для работы со сценами (как в Telegraf)
export class SceneContextSceneClass<
  TContext extends { session?: SceneSession<D> },
  D extends SceneSessionData = SceneSessionData,
> implements SceneContextScene<TContext> {
  private readonly options: SceneContextSceneOptions<D>;
  private leaving = false;

  constructor(
    private readonly ctx: TContext,
    private readonly scenes: Map<string, BaseScene<TContext>>,
    options: Partial<SceneContextSceneOptions<D>>
  ) {
    const fallbackSessionDefault: D = {} as D;
    this.options = { defaultSession: fallbackSessionDefault, ...options };
  }

  get session(): D {
    const defaultSession = Object.assign({}, this.options.defaultSession);
    
    // Поддержка как __scenes (как в Telegraf), так и scene (для обратной совместимости)
    let session: D | undefined;
    if (this.ctx.session?.__scenes) {
      session = this.ctx.session.__scenes as D;
    } else if ((this.ctx.session as any)?.scene) {
      // Обратная совместимость - преобразуем scene в __scenes
      session = { current: (this.ctx.session as any).scene } as D;
    }
    
    session = session ?? defaultSession;
    
    // Проверка expires
    const now = Math.floor(Date.now() / 1000);
    if (session.expires !== undefined && session.expires < now) {
      session = defaultSession;
    }
    
    // Сохраняем обратно в session
    if (this.ctx.session === undefined) {
      (this.ctx.session as any) = { __scenes: session };
    } else {
      this.ctx.session.__scenes = session;
      // Для обратной совместимости также сохраняем в scene
      if (session.current) {
        (this.ctx.session as any).scene = session.current;
      }
    }
    
    return session;
  }

  get state() {
    return (this.session.state ??= {});
  }

  set state(value: object) {
    this.session.state = { ...value };
  }

  get current(): BaseScene<TContext> | undefined {
    const sceneId = this.session.current ?? this.options.default;
    return sceneId === undefined || !this.scenes.has(sceneId)
      ? undefined
      : this.scenes.get(sceneId);
  }

  reset() {
    if (this.ctx.session !== undefined) {
      this.ctx.session.__scenes = Object.assign({}, this.options.defaultSession) as D;
      (this.ctx.session as any).scene = undefined;
    }
  }

  async enter(sceneId: string, initialState: object = {}, silent = false) {
    if (!this.scenes.has(sceneId)) {
      // Сцена не найдена - просто возвращаемся без ошибки
      return;
    }
    if (!silent) {
      await this.leave();
    }
    this.session.current = sceneId;
    this.state = initialState;
    const ttl = this.current?.ttl ?? this.options.ttl;
    if (ttl !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      this.session.expires = now + ttl;
    }
    if (this.current === undefined || silent) {
      return;
    }
    // Вызываем enter handler сцены
    const scene = this.current;
    if (scene && typeof (scene as any).handleEnter === 'function') {
      await (scene as any).handleEnter(this.ctx);
    } else if (scene && typeof (scene as any).enterHandler === 'function') {
      await (scene as any).enterHandler(this.ctx, async () => {});
    }
  }

  async reenter() {
    if (this.session.current === undefined) {
      return undefined;
    }
    return this.enter(this.session.current, this.state);
  }

  async leave() {
    if (this.leaving) return;
    try {
      this.leaving = true;
      if (this.current === undefined) {
        return;
      }
      const scene = this.current;
      if (scene && typeof (scene as any).handleLeave === 'function') {
        await (scene as any).handleLeave(this.ctx);
      } else if (scene && typeof (scene as any).leaveHandler === 'function') {
        await (scene as any).leaveHandler(this.ctx, async () => {});
      }
      return this.reset();
    } finally {
      this.leaving = false;
    }
  }
}

// Функция для создания scene контекста (для обратной совместимости)
export function createSceneContext<TContext = any>(
  ctx: TContext,
  stage: any
): SceneContextScene<TContext> {
  const scenes = (stage as any).scenes || new Map();
  return new SceneContextSceneClass(ctx as any, scenes, {
    defaultSession: {} as SceneSessionData
  });
}

