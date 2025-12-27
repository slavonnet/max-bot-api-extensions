import { BaseScene } from './base-scene';
import { StageOptions } from './types';
import { extendContext } from '../context/adapter';

export class Stage<TContext = any> {
  private scenes: Map<string, BaseScene<TContext>> = new Map();
  private options: StageOptions;

  constructor(scenes: BaseScene<TContext>[], options: StageOptions = {}) {
    this.options = options;
    scenes.forEach(scene => {
      this.scenes.set(scene.id, scene);
    });
  }

  middleware() {
    return async (ctx: any, next: () => Promise<void>) => {
      console.log('[DEBUG] Stage middleware: обработка обновления');
      // Расширяем контекст
      const extendedCtx = extendContext(ctx, this);
      
      // Получаем текущую сцену из сессии
      const currentSceneId = extendedCtx.session?.scene || null;
      console.log('[DEBUG] Stage middleware: текущая сцена:', currentSceneId || 'нет');
      
      // Проверяем, есть ли callback - если есть, сначала пытаемся обработать во всех сценах
      const callbackData = (ctx as any).callback?.payload || (ctx as any).callbackQuery?.data;
      let handled = false;
      
      // Если есть callback, сначала проверяем все сцены на наличие обработчика этого callback
      if (callbackData) {
        console.log('[DEBUG] Stage middleware: найден callback, payload:', callbackData);
        
        // Сначала проверяем текущую сцену
        if (currentSceneId) {
          const currentScene = this.scenes.get(currentSceneId);
          if (currentScene) {
            console.log('[DEBUG] Stage middleware: проверка callback в текущей сцене', currentSceneId);
            // Создаем временный контекст только для проверки callback
            const tempHandled = await this.checkCallbackInScene(currentScene, extendedCtx, callbackData);
            if (tempHandled) {
              console.log('[DEBUG] Stage middleware: callback обработан в текущей сцене');
              handled = true;
            }
          }
        }
        
        // Если не обработано, проверяем другие сцены (особенно greeter)
        if (!handled) {
          console.log('[DEBUG] Stage middleware: callback не обработан в текущей сцене, проверяем другие сцены');
          // Сначала проверяем greeter (основная сцена с большинством обработчиков)
          const greeterScene = this.scenes.get('greeter');
          if (greeterScene && currentSceneId !== 'greeter') {
            console.log('[DEBUG] Stage middleware: проверка callback в greeter');
            handled = await this.checkCallbackInScene(greeterScene, extendedCtx, callbackData);
            if (handled) {
              console.log('[DEBUG] Stage middleware: callback обработан в greeter');
              return;
            }
          }
          // Если не обработано, проверяем все остальные сцены
          for (const [sceneId, scene] of this.scenes.entries()) {
            if (sceneId !== currentSceneId && sceneId !== 'greeter') {
              console.log('[DEBUG] Stage middleware: проверка callback в', sceneId);
              handled = await this.checkCallbackInScene(scene, extendedCtx, callbackData);
              if (handled) {
                console.log('[DEBUG] Stage middleware: callback обработан в', sceneId);
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
      
      // Обрабатываем текущую сцену для команд и других событий
      if (currentSceneId) {
        const scene = this.scenes.get(currentSceneId);
        if (scene) {
          console.log('[DEBUG] Stage middleware: обработка сцены', currentSceneId);
          handled = await scene.handleUpdate(extendedCtx as any);
          console.log('[DEBUG] Stage middleware: сцена обработана, handled:', handled);
          if (handled) {
            return;
          }
        } else {
          console.log('[DEBUG] Stage middleware: сцена', currentSceneId, 'не найдена');
        }
      }

      await next();
    };
  }
  
  // Вспомогательный метод для проверки callback в сцене
  private async checkCallbackInScene(scene: BaseScene<any>, ctx: any, callbackData: string): Promise<boolean> {
    // Получаем action handlers из сцены (через рефлексию или публичный метод)
    // Для простоты создаем временный контекст и проверяем через handleUpdate,
    // но только для callback части
    const actionHandlers = (scene as any).actionHandlers;
    if (actionHandlers) {
      for (const [pattern, handler] of actionHandlers.entries()) {
        if (typeof pattern === 'string') {
          if (callbackData === pattern) {
            console.log('[DEBUG] checkCallbackInScene: найден action handler для:', pattern);
            await Promise.resolve(handler(ctx));
            return true;
          }
        } else if (pattern instanceof RegExp) {
          const match = callbackData.match(pattern);
          if (match) {
            console.log('[DEBUG] checkCallbackInScene: найден action handler (regex) для:', pattern);
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
