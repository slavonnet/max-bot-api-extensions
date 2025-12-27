import { SessionOptions, SessionStore } from './types';
import { extendContext } from '../context/adapter';

export function session(options: SessionOptions) {
  const {
    store,
    defaultSession = () => ({}),
    getSessionKey = (ctx) => {
      // Для Max Messenger используем chat_id из update или chat.id или user.id
      const chatId = (ctx.update as any)?.chat_id || ctx.chatId || ctx.chat?.id || ctx.message?.recipient?.chat_id || ctx.user?.user_id || ctx.user?.id || 0;
      console.log('[DEBUG] Session middleware: определение sessionKey, chatId:', chatId);
      return `session:${chatId}`;
    }
  } = options;

  return async (ctx: any, next: () => Promise<void>) => {
    console.log('[DEBUG] Session middleware: начало');
    // Расширяем контекст
    const extendedCtx = extendContext(ctx);
    
    const sessionKey = getSessionKey(extendedCtx);
    console.log('[DEBUG] Session middleware: sessionKey:', sessionKey);
    
    // Получаем сессию из хранилища
    let sessionData = await Promise.resolve(store.get(sessionKey));
    if (sessionData) {
      console.log('[DEBUG] Session middleware: сессия из хранилища: есть');
      console.log('[DEBUG] Session middleware: is_authenticated:', sessionData.is_authenticated, 'token:', sessionData.token ? 'есть (' + (sessionData.token?.substring(0, 10) || '') + '...)' : 'нет', 'myTelegramID:', sessionData.myTelegramID);
      console.log('[DEBUG] Session middleware: login:', sessionData.login || 'нет', 'tempState:', sessionData.tempState || 'нет');
    } else {
      console.log('[DEBUG] Session middleware: сессия из хранилища: нет');
    }
    
    // Если сессии нет, создаем новую
    if (!sessionData) {
      sessionData = defaultSession();
      console.log('[DEBUG] Session middleware: создана новая сессия');
    } else {
      // Объединяем с defaultSession, чтобы новые поля были добавлены
      // ВАЖНО: sessionData должен перезаписывать defaultData, чтобы сохранить is_authenticated и token
      const defaultData = defaultSession();
      sessionData = { ...defaultData, ...sessionData };
      console.log('[DEBUG] Session middleware: сессия загружена и объединена с defaultSession');
      console.log('[DEBUG] Session middleware: после объединения is_authenticated:', sessionData.is_authenticated, 'token:', sessionData.token ? 'есть' : 'нет');
    }

    // Добавляем сессию в контекст (и в extendedCtx, и в ctx)
    extendedCtx.session = sessionData;
    // Также добавляем в ctx напрямую, чтобы другие middleware видели
    try {
      if (!('session' in ctx)) {
        Object.defineProperty(ctx, 'session', {
          value: sessionData,
          writable: true,
          enumerable: true,
          configurable: true
        });
        console.log('[DEBUG] Session middleware: сессия добавлена в ctx');
      } else {
        (ctx as any).session = sessionData;
        console.log('[DEBUG] Session middleware: сессия обновлена в ctx');
      }
    } catch (e) {
      console.error('[DEBUG] Session middleware: ошибка добавления сессии в ctx:', e);
    }

    // Сохраняем сессию после обработки
    const originalNext = next;
    next = async () => {
      await originalNext();
      const sessionToSave = (ctx as any).session || extendedCtx.session;
      // Логируем ключевые поля для отладки
      if (sessionToSave) {
        console.log('[DEBUG] Session middleware: сохранение сессии');
        console.log('[DEBUG] Session middleware: is_authenticated:', sessionToSave.is_authenticated);
        console.log('[DEBUG] Session middleware: token:', sessionToSave.token ? 'есть (' + (sessionToSave.token?.substring(0, 10) || '') + '...)' : 'нет');
        console.log('[DEBUG] Session middleware: myTelegramID:', sessionToSave.myTelegramID);
        console.log('[DEBUG] Session middleware: login:', sessionToSave.login || 'нет');
        console.log('[DEBUG] Session middleware: tempState:', sessionToSave.tempState || 'нет');
      }
      await Promise.resolve(store.set(sessionKey, sessionToSave));
      console.log('[DEBUG] Session middleware: сессия сохранена в БД, sessionKey:', sessionKey);
    };

    await next();
  };
}
