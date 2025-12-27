import { SceneHandler } from './types';

export class BaseScene<TContext = any> {
  public id: string;
  private enterHandler?: SceneHandler<TContext>;
  private leaveHandler?: SceneHandler<TContext>;
  private commandHandlers: Map<string, SceneHandler<TContext>> = new Map();
  public actionHandlers: Map<string | RegExp, SceneHandler<TContext>> = new Map(); // Сделано публичным для доступа из Stage
  private eventHandlers: Array<{ filter: string | RegExp | Function, handler: SceneHandler<TContext> }> = [];
  private textHandler?: SceneHandler<TContext>;
  private messageHandler?: SceneHandler<TContext>;
  private startHandler?: SceneHandler<TContext>;

  constructor(id: string) {
    this.id = id;
  }

  start(handler: SceneHandler<TContext>) {
    this.startHandler = handler;
    this.commandHandlers.set('start', handler);
    return this;
  }

  enter(handler: SceneHandler<TContext>) {
    this.enterHandler = handler;
    return this;
  }

  leave(handler: SceneHandler<TContext>) {
    this.leaveHandler = handler;
    return this;
  }

  command(command: string, handler: SceneHandler<TContext>) {
    this.commandHandlers.set(command, handler);
    return this;
  }

  action(pattern: string | RegExp, handler: SceneHandler<TContext>) {
    this.actionHandlers.set(pattern, handler);
    return this;
  }

  on(filter: string | RegExp | Function, handler: SceneHandler<TContext>) {
    if (filter === 'message' || filter === 'message_created') {
      this.messageHandler = handler;
    } else {
      this.eventHandlers.push({ filter, handler });
    }
    return this;
  }

  hears(pattern: string | RegExp, handler: SceneHandler<TContext>) {
    if (typeof pattern === 'string') {
      this.textHandler = handler;
    }
    return this;
  }

  async handleEnter(ctx: TContext) {
    if (this.enterHandler) {
      await Promise.resolve(this.enterHandler(ctx));
    }
  }

  async handleLeave(ctx: TContext) {
    if (this.leaveHandler) {
      await Promise.resolve(this.leaveHandler(ctx));
    }
  }

  async handleUpdate(ctx: TContext): Promise<boolean> {
    console.log('[DEBUG] BaseScene.handleUpdate для сцены:', this.id);
    
    // СНАЧАЛА проверяем действия (callback queries) - они имеют приоритет
    // Для Max API используем callback.payload из контекста
    const callbackData = (ctx as any).callback?.payload || (ctx as any).callbackQuery?.data;
    if (callbackData) {
      console.log('[DEBUG] BaseScene: найден callback, payload:', callbackData);
      for (const [pattern, handler] of this.actionHandlers.entries()) {
        if (typeof pattern === 'string') {
          if (callbackData === pattern) {
            console.log('[DEBUG] BaseScene: найден action handler для:', pattern);
            await Promise.resolve(handler(ctx));
            return true;
          }
        } else if (pattern instanceof RegExp) {
          const match = callbackData.match(pattern);
          if (match) {
            console.log('[DEBUG] BaseScene: найден action handler (regex) для:', pattern);
            (ctx as any).match = match;
            await Promise.resolve(handler(ctx));
            return true;
          }
        }
      }
      console.log('[DEBUG] BaseScene: action handler не найден для callback:', callbackData);
    }

    // Затем проверяем команду start (специальный случай)
    if (this.commandHandlers.has('start')) {
      const startHandler = this.commandHandlers.get('start');
      if (startHandler) {
        // Проверяем, является ли это командой start
        const text = (ctx as any).message?.body?.text || (ctx as any).message?.text || '';
        console.log('[DEBUG] BaseScene: проверка команды start, текст:', text);
        if (text.startsWith('/start')) {
          console.log('[DEBUG] BaseScene: найдена команда start, вызываем handler');
          await Promise.resolve(startHandler(ctx));
          return true;
        }
      }
    }

    // Проверяем команды
    const messageText = (ctx as any).message?.body?.text || (ctx as any).message?.text;
    if (messageText) {
      const commandMatch = messageText.match(/^\/(\w+)/);
      if (commandMatch) {
        const command = commandMatch[1];
        console.log('[DEBUG] BaseScene: найдена команда:', command);
        const handler = this.commandHandlers.get(command);
        if (handler) {
          console.log('[DEBUG] BaseScene: handler найден, вызываем');
          await Promise.resolve(handler(ctx));
          return true;
        } else {
          console.log('[DEBUG] BaseScene: handler не найден для команды:', command);
        }
      }
    }

    // Проверяем текстовые сообщения
    if (messageText && this.textHandler) {
      console.log('[DEBUG] BaseScene: найден textHandler, вызываем');
      await Promise.resolve(this.textHandler(ctx));
      return true;
    }

    // Проверяем обработчики через on() с фильтрами
    for (const { filter, handler } of this.eventHandlers) {
      if (typeof filter === 'function') {
        if (filter(ctx)) {
          console.log('[DEBUG] BaseScene: фильтр-функция вернул true, вызываем handler');
          await Promise.resolve(handler(ctx));
          return true;
        }
      }
    }

    // Проверяем общие обработчики сообщений
    if ((ctx as any).message && this.messageHandler) {
      console.log('[DEBUG] BaseScene: найден messageHandler, вызываем');
      await Promise.resolve(this.messageHandler(ctx));
      return true;
    }

    // Проверяем другие события и фильтры
    for (const { filter, handler } of this.eventHandlers) {
      if (typeof filter === 'function') {
        if (filter(ctx)) {
          await Promise.resolve(handler(ctx));
          return true;
        }
      } else if (typeof filter === 'string') {
        const updateType = (ctx as any).updateType || (ctx as any).update?.type;
        if (updateType === filter || updateType === `message_${filter}`) {
          await Promise.resolve(handler(ctx));
          return true;
        }
      } else if (filter instanceof RegExp) {
        const text = (ctx as any).message?.body?.text || (ctx as any).message?.text || '';
        if (filter.test(text)) {
          await Promise.resolve(handler(ctx));
          return true;
        }
      }
    }

    return false;
  }
}

