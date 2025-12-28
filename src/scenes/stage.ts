import { BaseScene } from './base-scene';
import { StageOptions } from './types';
import { SceneContextSceneClass, SceneSessionData, SceneContextScene } from './context';
import {Context} from "@maxhub/max-bot-api";


export class Stage<TContext extends Context & {scene: SceneContextScene<TContext>}> {
  public scenes: Map<string, BaseScene<TContext>> = new Map();
  private options: StageOptions;

  constructor(scenes: BaseScene<TContext>[] = [], options: StageOptions = {}) {
    this.options = options;
    scenes.forEach(scene => {
      this.scenes.set(scene.id, scene);
    });
  }

  register(...scenes: BaseScene<TContext>[]) {
    scenes.forEach(scene => {
      if (scene?.id != null) {
        this.scenes.set(scene.id, scene);
      }
      // Игнорируем сцены без id вместо проброса ошибки
    });
    return this;
  }

  middleware() {
    return async (ctx: TContext, next: () => Promise<void>) => {
      // Создаем scene контекст (как в Telegraf)
      const scene = new SceneContextSceneClass<TContext, SceneSessionData>(
        ctx,
        this.scenes,
        {
          ttl: this.options.ttl,
          defaultSession: {} as SceneSessionData
        }
      );
      ctx.scene = scene;
      
      // Получаем текущую сцену через ctx.scene.current (как в Telegraf)
      const currentScene = ctx.scene.current;
      // Проверяем, есть ли callback - если есть, сначала пытаемся обработать во всех сценах
      const callbackData = ctx.callback?.payload || (ctx as any).callbackQuery?.data;
      let handled = false;
      
      // Если есть callback, сначала проверяем все сцены на наличие обработчика этого callback
      if (callbackData) {
        // Сначала проверяем текущую сцену
        if (currentScene) {
          const tempHandled = await this.checkCallbackInScene(currentScene, ctx, callbackData);
          if (tempHandled) {
            handled = true;
          }
        }
        
        // Если не обработано, проверяем другие сцены (особенно greeter)
        if (!handled) {
          const greeterScene = this.scenes.get('greeter');
          if (greeterScene && currentScene?.id !== 'greeter') {
            handled = await this.checkCallbackInScene(greeterScene, ctx, callbackData);
            if (handled) {
              return;
            }
          }
          // Если не обработано, проверяем все остальные сцены
          for (const [sceneId, scene] of this.scenes.entries()) {
            if (sceneId !== currentScene?.id && sceneId !== 'greeter') {
              handled = await this.checkCallbackInScene(scene, ctx, callbackData);
              if (handled) {
                return;
              }
            }
          }
        }
      }
      
      // Если callback обработан, выходим
      if (handled && callbackData) {
        return;
      }
      
      // Обрабатываем текущую сцену для команд и других событий (как в Telegraf)
      if (currentScene) {
        handled = await currentScene.handleUpdate(ctx);
        if (handled) {
          return;
        }
      }

      await next();
    };
  }
  
  // Вспомогательный метод для проверки callback в сцене
  private async checkCallbackInScene(scene: BaseScene<TContext>, ctx: TContext, callbackData: string): Promise<boolean> {
    // Получаем action handlers из сцены (через рефлексию или публичный метод)
    // Для простоты создаем временный контекст и проверяем через handleUpdate,
    // но только для callback части
    const actionHandlers = (scene as any).actionHandlers;
    if (actionHandlers) {
      for (const [pattern, handler] of actionHandlers.entries()) {
        if (typeof pattern === 'string') {
          if (callbackData === pattern) {
            await Promise.resolve(handler(ctx));
            return true;
          }
        } else if (pattern instanceof RegExp) {
          const match = pattern.exec(callbackData);
          if (match) {
            ctx.match = match;
            await Promise.resolve(handler(ctx));
            return true;
          }
        }
      }
    }
    return false;
  }

  getScene(id: string): BaseScene<TContext> | undefined {
    return this.scenes.get(id);
  }
}

// Экспортируем для совместимости с Telegraf
export const Scenes = {
  BaseScene,
  Stage
};
