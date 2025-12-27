Внимание! Пока версия основана на портировании моего приложения и может содержать специфику от реализации моего бота.
Можно использовать как пример, а не как готовую библиотеку

# Max Bot API Extensions

Расширения для библиотеки `@maxhub/max-bot-api`, добавляющие функционал сессий и сцен (scenes) для совместимости с Telegraf.

## Установка

у меня лежит в папке проекта эта папка и подключена она как
```
import {Bot} from "@maxhub/max-bot-api";
import {session, SQLiteStore} from "./max-bot-extensions/src/session";
import {Scenes} from "./max-bot-extensions/src/scenes";
import {extendContext, ExtendedContext} from "./max-bot-extensions/src/context";
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

