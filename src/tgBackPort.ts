import { Context } from '@maxhub/max-bot-api';
import { createReplyMethod, createReplyWithPhotoMethod, createReplyWithMarkdownV2Method, createDeleteMessageMethod, createDeleteMessagesMethod, createLeaveChatMethod, createEditMessageMediaMethod } from './tgBackPort/methods';

// Интерфейс для полей совместимости с Telegraf
// Эти поля заполняются middleware из структуры MAX API
export interface SupportTgContext {
  // message_id для совместимости с Telegraf
  // Заполняется из ctx.message.body.mid или из результата ctx.reply()
  message_id?: number | string;
  // mid - оригинальный идентификатор сообщения из MAX API
  mid?: string | number;
  
  // Расширенные поля для совместимости с Telegraf
  update_id?: number;
  chat?: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
  };
  message?: {
    message_id?: number | string;
    text?: string;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    contact?: {
      phone_number: string;
      user_id: number;
    };
    body?: {
      text?: string;
      mid?: string | number;
    };
    mid?: string | number;
  };
  callbackQuery?: {
    data?: string;
  };
  telegram: {
    setMyCommands: (commands: any[], options?: any) => Promise<void>;
  };
  
  // Переопределенные методы для совместимости (опциональные, добавляются middleware)
  deleteMessage?: (messageId: number | string) => Promise<boolean>;
  leaveChat?: () => Promise<any>;
  reply?: (text: string, options?: any) => Promise<SupportTgContext & any>;
  replyWithPhoto?: (photo: any, options?: any) => Promise<SupportTgContext & any>;
  replyWithMarkdownV2?: (text: string, options?: any) => Promise<SupportTgContext & any>;
  deleteMessages?: (messageIds: (number | string)[]) => Promise<boolean>;
  editMessageMedia?: (media: any, options?: any) => Promise<boolean>;
}

// Тип для контекста с поддержкой Telegraf (используется в middleware)
export type TgContext<TContext extends Context = Context> = TContext & Partial<SupportTgContext>;

// Объект для экспорта middleware
export const tgBackPort = {
  // Middleware для добавления поддержки Telegraf API
  // Заполняет SupportTgContext из структуры MAX API
  middleware<TContext extends Context = Context>(
  ): (ctx: TgContext<TContext>, next: () => Promise<void>) => Promise<void> {
    return async (ctx: TgContext<TContext>, next: () => Promise<void>) => {
      // Заполняем update_id
      if (!ctx.update_id) {
        (ctx as any).update_id = (ctx.update as any)?.update_id || 0;
      }

      // Заполняем message_id и mid из ctx.message.body.mid
      // ВАЖНО: message_id должен быть равен mid для совместимости
      if (ctx.message?.body?.mid) {
        const mid = ctx.message.body.mid;
        // message_id просто равен mid (не парсим число из строки)
        (ctx as any).message_id = mid;
        (ctx as any).mid = mid;
      }


      // Заполняем callbackQuery для совместимости
      if (ctx.callback && !ctx.callbackQuery) {
        (ctx as any).callbackQuery = {
          data: ctx.callback.payload || undefined
        };
      }

      // Добавляем telegram для совместимости (всегда, так как это обязательное поле)
      const telegramObj = {
        setMyCommands: async (commands: any[], options?: any) => {
          try {
            // MAX API setMyCommands принимает команды с полем 'name', а не 'command'
            // Преобразуем команды из формата Telegram (command) в формат Max API (name)
            const maxCommands = commands.map(cmd => {
              if (cmd.name) {
                return { name: cmd.name, description: cmd.description || '' };
              }
              if (cmd.command) {
                return { name: cmd.command, description: cmd.description || '' };
              }
              return { name: cmd.name || cmd.command || '', description: cmd.description || '' };
            });
            
            // MAX API setMyCommands принимает только commands, options не поддерживаются
            await ctx.api.setMyCommands(maxCommands);
          } catch (e) {
            // Игнорируем ошибку, чтобы не ломать работу бота
          }
        }
      };
      
      // Всегда присваиваем telegram (перезаписываем, если уже есть)
      (ctx as any).telegram = telegramObj;

      // Добавляем методы для совместимости (если их еще нет)
      // Просто присваиваем функции из SupportTgContext
      if (!ctx.reply) {
        (ctx as any).reply = createReplyMethod(ctx);
      }
      
      if (!ctx.replyWithPhoto) {
        (ctx as any).replyWithPhoto = createReplyWithPhotoMethod(ctx);
      }
      
      if (!ctx.replyWithMarkdownV2) {
        (ctx as any).replyWithMarkdownV2 = createReplyWithMarkdownV2Method(ctx);
      }
      
      if (!ctx.deleteMessage) {
        (ctx as any).deleteMessage = createDeleteMessageMethod(ctx);
      }
      
      if (!ctx.deleteMessages) {
        (ctx as any).deleteMessages = createDeleteMessagesMethod(ctx);
      }
      
      if (!ctx.leaveChat) {
        (ctx as any).leaveChat = createLeaveChatMethod(ctx);
      }
      
      if (!ctx.editMessageMedia) {
        (ctx as any).editMessageMedia = createEditMessageMediaMethod(ctx);
      }
      
      return next();
    };
  }
};
