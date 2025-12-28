import { SessionOptions, SessionStore } from './types';

export function session(options: SessionOptions) {
  const {
    store,
    defaultSession = () => ({}),
    getSessionKey = (ctx) => {
      // Для Max Messenger используем chat_id из update или chat.id или user.id
      const chatId = (ctx.update as any)?.chat_id || ctx.chatId || ctx.chat?.id || ctx.message?.recipient?.chat_id || ctx.user?.user_id || ctx.user?.id || 0;
      return `session:${chatId}`;
    }
  } = options;

  return async (ctx: any, next: () => Promise<void>) => {
    const sessionKey = await getSessionKey(ctx);
    if (!sessionKey) {
      // Если нет ключа сессии, просто пропускаем
      (ctx as any).session = undefined;
      return await next();
    }
    // Получаем сессию из хранилища
    let sessionData = await Promise.resolve(store.get(sessionKey));
    
    // Если сессии нет, создаем новую
    if (!sessionData) {
      sessionData = defaultSession();
    } else {
      // Объединяем с defaultSession, чтобы новые поля были добавлены
      // ВАЖНО: sessionData должен перезаписывать defaultData, чтобы сохранить is_authenticated и token
      const defaultData = defaultSession();
      sessionData = { ...defaultData, ...sessionData };
    }

    // Используем геттер/сеттер для отслеживания изменений (как в Telegraf)
    let touched = false;
    const sessionRef = { ref: sessionData };

    Object.defineProperty(ctx, 'session', {
      get() {
        touched = true;
        return sessionRef.ref;
      },
      set(value) {
        touched = true;
        sessionRef.ref = value;
      },
      enumerable: true,
      configurable: true
    });

    try {
      await next();
    } finally {
      // Сохраняем сессию только если она была изменена
      if (touched) {
        const sessionToSave = sessionRef.ref;
        if (sessionToSave == null) {
          await Promise.resolve(store.delete(sessionKey));
        } else {
          await Promise.resolve(store.set(sessionKey, sessionToSave));
        }
      }
    }
  };
}
