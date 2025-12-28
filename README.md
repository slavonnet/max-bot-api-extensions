Внимание! Пока версия основана на портировании моего приложения и может содержать специфику от реализации моего бота.
Можно использовать как пример, а не как готовую библиотеку

# Max Bot API Extensions

Расширения для библиотеки https://github.com/max-messenger/max-bot-api-client-ts, добавляющие функционал сессий и сцен (scenes) для совместимости с Telegraf.

## Использование



```typescript
export interface MySessionData {
// ....
}

export const greeterScene1 = new Scenes.BaseScene<MyContext>("greeter1");
export const greeterScene2 = new Scenes.BaseScene<MyContext>("greeter2");

export const scenes = new Scenes.Stage<MyContext>([greeterScene1, greeterScene2 {
    // ttl: 10,
});

export type MyContext = Context & SupportTgContext & {
    // declare scene type
    scene: SceneContextScene<MyContext>;
    // declare session type
    session: MySessionData;
};

// Типизируем бота с MyContext
const bot = new Bot<MyContext>(token);

// Используем сессии с SQLite
bot.use(session({
    store: SQLiteStore({filename: "./telegraf-sessions.sqlite"}),
    defaultSession: () => ({
        tempState: "",
        messagesIdToDelete: [],
        lastUpdate: Date.now(),
        is_authenticated: false,
        login: "",
        password: "",
        token: "",
        tariffIndex: 0,
        tariffsChangeJson: "",
        myContactNumber: "",
        tariffRequestCount: 0,
        myTelegramFirstName: "",
        myTelegramLastName: "",
        myTelegramUsername: "",
        myTelegramID: 0,
        tariffPromisedRequestCount: 0
    })
}));

// Добавляем совместимость с Telegraf (заполняет SupportTgContext и добавляет методы)
// ВАЖНО: должен быть ДО scenes.middleware(), чтобы telegram был доступен в сценах
bot.use(tgBackPort.middleware());

// Используем сцены
bot.use(scenes.middleware());
```

## Основные возможности

### ✅ Сессии (Sessions)

Хранение данных пользователей между сообщениями с поддержкой SQLite хранилища. Поддерживает сессии как для пользователей, так и для чатов.

**Особенности:**
- Автоматическое сохранение сессии после каждого обновления
- Поддержка вложенных сессий (сессии внутри комнат)
- SQLite хранилище для персистентности данных
- Типизированные сессии через TypeScript

### ✅ Сцены (Scenes)

Система экранов и состояний (Finite State Machine) для управления диалогами с пользователями.

**Особенности:**
- Создание сцен с обработчиками входа, выхода и действий
- Автоматическое управление состоянием сцены
- Поддержка вложенных сцен
- Совместимость с Telegraf Scenes API

### ✅ Markup

Утилиты для создания клавиатур (Inline и Reply) в формате, совместимом с Telegraf.

**Особенности:**
- `Markup.inlineKeyboard()` - создание inline-клавиатур
- `Markup.keyboard()` - создание reply-клавиатур
- `Markup.removeKeyboard()` - удаление клавиатуры
- Автоматическое преобразование в формат MAX API

### ✅ Context Adapter (tgBackPort)

Расширяет стандартный контекст Max API полями и методами, знакомыми по Telegraf.

**Добавляемые методы:**
- `ctx.reply()` - отправка сообщения с автоматическим определением получателя
- `ctx.replyWithPhoto()` - отправка фото (поддержка URL и локальных файлов)
- `ctx.replyWithMarkdownV2()` - отправка сообщения с Markdown форматированием
- `ctx.editMessageMedia()` - редактирование медиа-сообщений
- `ctx.deleteMessage()` / `ctx.deleteMessages()` - удаление сообщений
- `ctx.leaveChat()` - выход из чата
- `ctx.telegram.setMyCommands()` - установка команд бота

**Добавляемые поля:**
- `ctx.message_id` - ID сообщения (равен `mid`)
- `ctx.mid` - ID сообщения в формате MAX API
- `ctx.chat` - информация о чате
- `ctx.message` - текущее сообщение
- `ctx.update_id` - ID обновления


## API Reference

### Session

#### `session(options)`

Создает middleware для управления сессиями.

**Параметры:**
- `options.store` - хранилище сессий (SQLiteStore или кастомное)
- `options.defaultSession` - объект с дефолтными значениями сессии

**Пример:**
```typescript
bot.use(session({
  store: SQLiteStore({ filename: './sessions.sqlite' }),
  defaultSession: { counter: 0 }
}));
```

### Scenes

#### `new Scenes.BaseScene<Context>(sceneId)`

Создает новую сцену.

**Методы сцены:**
- `scene.enter(handler)` - обработчик входа в сцену
- `scene.leave(handler)` - обработчик выхода из сцены
- `scene.on(event, handler)` - обработчик событий в сцене
- `scene.action(action, handler)` - обработчик callback-кнопок

**Пример:**
```typescript
const scene = new Scenes.BaseScene<MyContext>('myScene');

scene.enter((ctx) => {
  ctx.reply('Вход в сцену');
});

scene.on('text', (ctx) => {
  ctx.reply('Текстовое сообщение');
});

scene.action('button', (ctx) => {
  ctx.reply('Нажата кнопка');
});
```

#### `new Scenes.Stage<Context>(scenes)`

Создает Stage для управления сценами.

**Методы:**
- `stage.middleware()` - возвращает middleware для подключения к боту

**Пример:**
```typescript
const stage = new Scenes.Stage<MyContext>([scene1, scene2]);
bot.use(stage.middleware());
```

### Markup

#### `Markup.inlineKeyboard(buttons)`

Создает inline-клавиатуру.

**Пример:**
```typescript
Markup.inlineKeyboard([
  [Markup.button.callback('Кнопка 1', 'action1')],
  [Markup.button.callback('Кнопка 2', 'action2')]
])
```

#### `Markup.keyboard(buttons)`

Создает reply-клавиатуру.

**Пример:**
```typescript
Markup.keyboard([
  ['Кнопка 1', 'Кнопка 2'],
  ['Кнопка 3']
])
```

#### `Markup.removeKeyboard()`

Удаляет reply-клавиатуру.

### tgBackPort

#### `tgBackPort.middleware(stage?)`

Создает middleware для расширения контекста методами и полями Telegraf.

**Пример:**
```typescript
bot.use(tgBackPort.middleware());
```

## Ограничения

- `message_id` в MAX API - это строка (`mid`), а не число как в Telegram
- Некоторые методы Telegraf могут работать по-другому из-за различий в API
- Поддержка не всех типов медиа (только изображения через `replyWithPhoto`)

