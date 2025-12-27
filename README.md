Внимание! Пока версия основана на портировании моего приложения и может содержать специфику от реализации моего бота.
Можно использовать как пример, а не как готовую библиотеку

# Max Bot API Extensions

Расширения для библиотеки `@maxhub/max-bot-api`, добавляющие функционал сессий и сцен (scenes) для совместимости с Telegraf.

## Установка

у меня лежит в папке проекта эта папка и подключена она как
```
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

```
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

```

## Функционал

- ✅ **Сессии**: Хранение данных пользователей между сообщениями (поддержка SQLite).
- ✅ **Scenes**: Система экранов и состояний (Finite State Machine).
- ✅ **Markup**: Утилиты для создания клавиатур (Inline и Reply).
- ✅ **Context Adapter**: Расширяет стандартный контекст Max API полями и методами, знакомыми по Telegraf (`ctx.reply`, `ctx.message`, `ctx.chat` и др.).
- ✅ **Filters**: Поддержка фильтров типа `message('text')`.

## Использование

```typescript
import { Bot } from '@maxhub/max-bot-api';
import { session, SQLiteStore } from '@maxhub/max-bot-api-extensions/session';
import { Scenes } from '@maxhub/max-bot-api-extensions/scenes';

const bot = new Bot(process.env.BOT_TOKEN);

// Использование сессий
bot.use(session({ store: SQLiteStore({ filename: './sessions.sqlite' }) }));

// Использование сцен
const stage = new Scenes.Stage([myScene1, myScene2]);
bot.use(stage.middleware());
```

