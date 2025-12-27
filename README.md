Внимание! Пока версия основана на портировании моего приложения и может содержать специфику от реализации моего бота.
Можно использовать как пример, а не как готовую библиотеку

# Max Bot API Extensions

Расширения для библиотеки `@maxhub/max-bot-api`, добавляющие функционал сессий и сцен (scenes) для совместимости с Telegraf.

## Использование

у меня лежит в папке проекта эта папка и подключена она как
```ts
// копипсат частей из разных импортов проекта, чтобы было по типам понятно

// Экспорты для совместимости (не используются напрямую, доступны через scene контекст)
export const enter = (sceneId: string) => (ctx: any) => ctx.scene.enter(sceneId);
export const leave = () => (ctx: any) => ctx.scene.leave();
export const reenter = () => (ctx: any) => ctx.scene.reenter();

export interface MySessionData {
    myTelegramUsername: string;
    myTelegramFirstName: string;
    myTelegramLastName: string;
    tariffRequestCount: number;
}

export interface MyContext extends ExtendedContext {
    scene: SceneContextScene<MyContext>;
    session: MySessionData;
}

export const scenes = new Scenes.Stage<MyContext>([greeterScene, loginScene, changeTariff], {
    // ttl: 10,
});
```

```ts
import {Bot} from "@maxhub/max-bot-api";
import {session, SQLiteStore} from "./max-bot-extensions/src/session";
import {Scenes} from "./max-bot-extensions/src/scenes";
import {extendContext, ExtendedContext} from "./max-bot-extensions/src/context";
// тут еще импорты. Их содержание указал выше

// Используем сессии с SQLite
bot.use(session({
    store: SQLiteStore({filename: "./telegraf-sessions.sqlite"}),
    defaultSession: () => ({
        tariffRequestCount: 0,
        myTelegramFirstName: "",
        myTelegramLastName: "",
        myTelegramUsername: "",
    })
}));


// Middleware для расширения контекста
bot.use(async (ctx, next) => {
    console.log('[DEBUG] Middleware: расширение контекста');
    console.log('[DEBUG] Update type (updateType):', ctx.updateType || 'unknown');
    console.log('[DEBUG] Update type (update_type):', (ctx as any).update?.update_type || 'unknown');
    console.log('[DEBUG] Message:', ctx.message ? 'есть' : 'нет');
    console.log('[DEBUG] Callback:', ctx.callback ? 'есть' : 'нет');
    
    // Детальная отладка структуры ctx
    console.log('[DEBUG] ========== СТРУКТУРА CTX ==========');
    console.log('[DEBUG] ctx.updateType (геттер):', ctx.updateType);
    console.log('[DEBUG] ctx.update:', ctx.update ? 'есть' : 'нет');
    if (ctx.update) {
        console.log('[DEBUG] ctx.update (полная структура):', JSON.stringify(ctx.update, null, 2));
    }
    console.log('[DEBUG] ctx.message:', ctx.message ? 'есть' : 'нет');
    if (ctx.message) {
        console.log('[DEBUG] ctx.message:', JSON.stringify(ctx.message, null, 2));
    }
    console.log('[DEBUG] ctx.callback:', ctx.callback ? 'есть' : 'нет');
    if (ctx.callback) {
        console.log('[DEBUG] ctx.callback:', JSON.stringify(ctx.callback, null, 2));
    }
    console.log('[DEBUG] ctx.chat:', ctx.chat ? 'есть' : 'нет');
    if (ctx.chat) {
        console.log('[DEBUG] ctx.chat:', JSON.stringify(ctx.chat, null, 2));
    }
    console.log('[DEBUG] ctx.user:', ctx.user ? 'есть' : 'нет');
    if (ctx.user) {
        console.log('[DEBUG] ctx.user:', JSON.stringify(ctx.user, null, 2));
    }
    console.log('[DEBUG] ctx.startPayload:', ctx.startPayload || 'нет');
    console.log('[DEBUG] ====================================');
    
    // Проверяем, есть ли уже session в ctx (добавлена middleware сессий)
    const existingSession = (ctx as any).session;
    console.log('[DEBUG] Контекст расширения: session в ctx:', existingSession ? 'есть' : 'нет');
    
    const extendedCtx = extendContext(ctx, scenes) as MyContext;
    
    // Если session уже есть в ctx, используем её
    if (existingSession) {
        extendedCtx.session = existingSession;
        console.log('[DEBUG] Контекст расширен, session из ctx использована');
    } else {
        console.log('[DEBUG] Контекст расширен, session:', extendedCtx.session ? 'есть' : 'нет');
    }
    
    // Добавляем только те свойства, которых нет в оригинальном контексте
    // Используем Object.defineProperty для безопасного добавления
    const propsToAdd: string[] = ['scene', 'session', 'message', 'callbackQuery', 'telegram', 
                        'replyWithPhoto', 'replyWithMarkdownV2', 'deleteMessages', 'editMessageMedia', 'update_id'];
    
    for (const prop of propsToAdd) {
        if ((extendedCtx as any)[prop] !== undefined) {
            try {
                if (!(prop in ctx)) {
                    Object.defineProperty(ctx, prop, {
                        value: (extendedCtx as any)[prop],
                        writable: true,
                        enumerable: true,
                        configurable: true
                    });
                    console.log('[DEBUG] Добавлено свойство:', prop);
                } else if (prop === 'session' && existingSession) {
                    // Обновляем session, если она уже есть
                    (ctx as any)[prop] = extendedCtx.session;
                    console.log('[DEBUG] Обновлено свойство: session');
                }
            } catch (e) {
                console.error('[DEBUG] Ошибка добавления свойства', prop, ':', e);
            }
        }
    }
    
    // Для chat не переопределяем, если он уже есть (read-only)
    // Используем расширенную версию через extendedCtx в обработчиках
    
    return next();
});

// Обработка ошибок на уровне бота
bot.use(async (ctx, next) => {
    try {
        await next();
    } catch (error) {
        console.error('[DEBUG] ========== НЕОБРАБОТАННАЯ ОШИБКА ==========');
        console.error('[DEBUG] Ошибка:', error);
        console.error('[DEBUG] Stack:', error instanceof Error ? error.stack : 'нет stack');
        console.error('[DEBUG] Update type:', ctx.updateType);
        console.error('[DEBUG] ===========================================');
        
        // Пытаемся отправить сообщение об ошибке пользователю
        try {
            const extendedCtx = ctx as unknown as MyContext;
            if (extendedCtx.reply) {
                await extendedCtx.reply("Произошла ошибка. Попробуйте позже или обратитесь в поддержку.");
            }
        } catch (replyError) {
            console.error('[DEBUG] Ошибка при отправке сообщения об ошибке:', replyError);
        }
        
        // Не пробрасываем ошибку дальше, чтобы бот продолжал работать
    }
});

bot.use(scenes.middleware());

// Обрабатываем событие bot_started (когда пользователь нажимает кнопку "старт")
bot.on('bot_started', async (ctx) => {
    console.log('[DEBUG] ========== СОБЫТИЕ bot_started ОБРАБОТАНО ==========');
    const extendedCtx = ctx as unknown as MyContext;
    
    // Если чат не является приватным, выходим из чата
    const chatType = (extendedCtx as any).chat?.type || (ctx as any).chat?.type;
    if (chatType && chatType != "private"){
        console.log('[DEBUG] Чат не приватный, выход из чата');
        return extendedCtx.leaveChat?.();
    }

});

// Обрабатываем все сообщения, если сцена не установлена - переходим на login
bot.on('message_created', async (ctx) => {
    const extendedCtx = ctx as unknown as MyContext;
    
    // Если сцена не установлена и это не команда /start, переходим на login
    const currentScene = (extendedCtx.session as any)?.scene;
    const messageText = extendedCtx.message?.body?.text || '';
    
    if (!currentScene && messageText && !messageText.startsWith('/')) {
        console.log('[DEBUG] Сцена не установлена, переход на login');
        return extendedCtx.scene?.enter("login");
    }
});

// Обрабатываем команду /start
bot.command('start', async (ctx) => {
    console.log('[DEBUG] ========== КОМАНДА /start ОБРАБОТАНА ==========');
    console.log('[DEBUG] Команда /start получена через bot.command()');
    // Используем расширенный контекст из middleware
    const extendedCtx = ctx as unknown as MyContext;
    console.log('[DEBUG] Extended context, session:', extendedCtx.session ? 'есть' : 'нет');
    console.log('[DEBUG] Chat type:', (extendedCtx as any).chat?.type || (ctx as any).chat?.type || 'не определен');
    
    // Если чат не является приватным, выходим из чата
    // Используем оригинальный chat из ctx, если расширенный недоступен
    const chatType = (extendedCtx as any).chat?.type || (ctx as any).chat?.type;
    if (chatType && chatType != "private"){
        console.log('[DEBUG] Чат не приватный, выход из чата');
        return extendedCtx.leaveChat?.();
    }

});


// Обработка всех сообщений для отладки
bot.on('message_created', async (ctx) => {
    console.log('[DEBUG] Событие message_created получено');
    const messageText = (ctx as any).message?.body?.text || '';
    console.log('[DEBUG] Message body text:', messageText);
    console.log('[DEBUG] Message body:', JSON.stringify((ctx as any).message?.body, null, 2));
    
    // Если это не команда, обрабатываем через сцены
    if (messageText && !messageText.startsWith('/')) {
        console.log('[DEBUG] Обычное текстовое сообщение, передаем в сцены');
    }
});

bot.on('message_callback', async (ctx) => {
    console.log('[DEBUG] Событие message_callback получено');
    console.log('[DEBUG] Callback payload:', (ctx as any).callback?.payload);
    
    const extendedCtx = ctx as unknown as MyContext;
    const payload = (ctx as any).callback?.payload;
    
    // Если это команда /start через callback
    if (payload === '/start' || payload === 'start') {
        console.log('[DEBUG] Callback /start, обрабатываем как команду');
        // Вызываем обработчик команды start
        const extendedCtx = ctx as unknown as MyContext;
        
        if (extendedCtx.chat?.type != "private"){
            return extendedCtx.leaveChat?.();
        }

    }
});

console.log('[DEBUG] Запуск бота...');
bot.start().then(() => {
    console.log('[DEBUG] ✅ Бот успешно запущен и готов к работе!');
    console.log('[DEBUG] Ожидание сообщений...');
}).catch(err => {
    console.error('[DEBUG] ❌ Ошибка запуска бота:', err);
    console.error('[DEBUG] Stack:', err.stack);
    process.exit(1);
});

process.once('SIGINT', () => {
    console.log('Stopping bot...');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('Stopping bot...');
    process.exit(0);
});



```

## Функционал

- ✅ **Сессии**: Хранение данных пользователей между сообщениями (поддержка SQLite).
- ✅ **Scenes**: Система экранов и состояний (Finite State Machine).
- ✅ **Markup**: Утилиты для создания клавиатур (Inline и Reply).
- ✅ **Context Adapter**: Расширяет стандартный контекст Max API полями и методами, знакомыми по Telegraf (`ctx.reply`, `ctx.message`, `ctx.chat` и др.).
- ✅ **Filters**: Поддержка фильтров типа `message('text')`.

```

