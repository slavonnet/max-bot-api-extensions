Внимание! Пока версия основана на портировании моего приложения и может содержать специфику от реализации моего бота.
Можно использовать как пример, а не как готовую библиотеку

# Max Bot API Extensions

Расширения для библиотеки `@maxhub/max-bot-api`, добавляющие функционал сессий и сцен (scenes) для совместимости с Telegraf.

## Установка

```bash
npm install @maxhub/max-bot-api-extensions
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

