import { Context } from '@maxhub/max-bot-api';
import { SceneContextScene, createSceneContext } from '../scenes/context';

// Расширяем контекст Max Bot API для совместимости с Telegraf
export interface ExtendedContext {
  // Все поля из Context
  [key: string]: any;
  update_id: number;
  // Расширенные поля для совместимости
  scene?: SceneContextScene;
  session?: any;
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
    mid?: string | number; // Оригинальный mid из Max API
  };
  callbackQuery?: {
    data?: string;
  };
  telegram?: any;
  
  // Переопределенные методы для совместимости
  deleteMessage: (messageId: number | string) => Promise<boolean>;
  leaveChat: () => Promise<any>;
  
  // Дополнительные методы для совместимости
  replyWithPhoto?: (photo: any, options?: any) => Promise<any>;
  replyWithMarkdownV2?: (text: string, options?: any) => Promise<any>;
  deleteMessages?: (messageIds: (number | string)[]) => Promise<boolean>;
  editMessageMedia?: (media: any, options?: any) => Promise<boolean>;
}

// Функция для расширения контекста
export function extendContext(ctx: Context, stage?: any): ExtendedContext {
  // Проверяем, есть ли уже session в ctx (добавлена middleware сессий)
  const existingSession = (ctx as any).session;
  
  const extended = {
    ...ctx,
    match: ctx.match,
    update_id: (ctx as any).update?.update_id || 0,
    session: existingSession // Используем существующую session, если есть
  } as unknown as ExtendedContext;

  // Добавляем chat (только если его еще нет)
  // Используем геттер, чтобы не конфликтовать с существующим chat
  if (!('chat' in extended) || !extended.chat) {
    const chat = ctx.chat;
    if (chat) {
      // Преобразуем ChatType Max в тип для Telegraf
      const chatTypeMap: Record<string, 'private' | 'group' | 'supergroup' | 'channel'> = {
        'dialog': 'private',
        'chat': 'group',
        'channel': 'channel'
      };
      Object.defineProperty(extended, 'chat', {
        get() {
          return {
            id: chat.chat_id || 0,
            type: chatTypeMap[chat.type] || 'private'
          };
        },
        enumerable: true,
        configurable: true
      });
    } else {
      // Если chat нет, но есть chat_id в update (например, для bot_started)
      const chatId = ctx.chatId || (ctx.update as any)?.chat_id;
      Object.defineProperty(extended, 'chat', {
        get() {
          return {
            id: chatId || 0,
            type: 'private' as const
          };
        },
        enumerable: true,
        configurable: true
      });
    }
  }

  // Добавляем message с совместимыми полями
  if (ctx.message && !extended.message) {
    const msg = ctx.message;
    const user = ctx.user;
    const mid = msg.body?.mid;
    // Max API использует mid как строку (например, "mid.000000000f2ed3e1019b58654c700afd")
    // Пытаемся извлечь числовую часть для совместимости, но сохраняем оригинальный mid
    let messageIdNum = 0;
    if (mid) {
      if (typeof mid === 'string') {
        // Пытаемся найти числовую часть в строке
        const numMatch = mid.match(/\d+/);
        if (numMatch) {
          messageIdNum = parseInt(numMatch[0]) || 0;
        }
        // Если не нашли число, используем хеш строки как число для совместимости
        if (messageIdNum === 0) {
          // Простой хеш строки для получения числа
          let hash = 0;
          for (let i = 0; i < mid.length; i++) {
            hash = ((hash << 5) - hash) + mid.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
          }
          messageIdNum = Math.abs(hash);
        }
      } else {
        messageIdNum = parseInt(String(mid)) || 0;
      }
    }
    extended.message = {
      message_id: messageIdNum || (mid ? String(mid) : 0), // Для совместимости возвращаем число или строку
      text: msg.body?.text || undefined,
      from: user ? {
        id: user.user_id || 0,
        first_name: user.name || undefined,
        last_name: undefined, // Max API не имеет last_name
        username: user.username || undefined
      } : undefined,
      body: {
        text: msg.body?.text || undefined,
        mid: mid || undefined // Сохраняем оригинальный mid (строка)
      }
    };
    // Добавляем mid напрямую в message для удобства
    (extended.message as any).mid = mid;
  }

  // Добавляем scene контекст
  if (stage) {
    extended.scene = createSceneContext(extended, stage);
  }

  // Добавляем методы для совместимости
  if (!extended.reply) {
    extended.reply = async (text: string, options?: any) => {
      // Преобразуем reply_markup в формат Max API (attachments)
      let maxOptions: any = { ...options };
      
      if (options?.reply_markup) {
        console.log('[DEBUG] reply: преобразование reply_markup в формат Max API');
        const markup = options.reply_markup;
        
        // Если options уже содержит attachments (из Markup.inlineKeyboard), используем их
        if (options.attachments) {
          maxOptions.attachments = options.attachments;
          console.log('[DEBUG] reply: используются attachments из options, количество:', options.attachments.length);
        } else if (markup.inline_keyboard) {
          // Преобразуем reply_markup.inline_keyboard в формат Max API
          // Max API ожидает массив массивов кнопок
          const buttonsRows: any[][] = [];
          
          for (const row of markup.inline_keyboard) {
            const maxRow: any[] = [];
            for (const button of row) {
              if (button.callback_data) {
                maxRow.push({
                  type: 'callback',
                  text: button.text,
                  payload: button.callback_data
                });
              } else if (button.url) {
                // URL кнопки - используем как callback с URL в payload
                maxRow.push({
                  type: 'callback',
                  text: button.text,
                  payload: button.url
                });
              }
            }
            if (maxRow.length > 0) {
              buttonsRows.push(maxRow);
            }
          }
          
          if (buttonsRows.length > 0) {
            maxOptions.attachments = [{
              type: 'inline_keyboard',
              payload: {
                buttons: buttonsRows
              }
            }];
            console.log('[DEBUG] reply: создана inline_keyboard с', buttonsRows.length, 'рядами кнопок');
          }
        }
        
        // Удаляем reply_markup, так как мы преобразовали его в attachments
        delete maxOptions.reply_markup;
      }
      
      console.log('[DEBUG] reply: отправка сообщения, text длина:', text.length);
      console.log('[DEBUG] reply: maxOptions.attachments:', maxOptions.attachments ? JSON.stringify(maxOptions.attachments, null, 2) : 'нет');
      const result = await ctx.reply(text, maxOptions);
      const mid = result?.body?.mid;
      console.log('[DEBUG] reply: сообщение отправлено, mid:', mid, 'тип:', typeof mid);
      // Max API использует mid как строку, но для совместимости возвращаем и как число, и как строку
      // Пытаемся извлечь числовую часть из mid, если это возможно
      let messageIdNum = 0;
      if (mid) {
        if (typeof mid === 'string') {
          // Пытаемся найти числовую часть в строке (например, "mid.000000000f2ed3e1019b58654c700afd")
          const numMatch = mid.match(/\d+/);
          if (numMatch) {
            messageIdNum = parseInt(numMatch[0]) || 0;
          }
        } else {
          messageIdNum = parseInt(String(mid)) || 0;
        }
      }
      // Возвращаем объект с message_id (число для совместимости) и mid (строка для Max API)
      const returnValue: any = {
        message_id: messageIdNum || (mid ? String(mid) : 0), // Для совместимости
        mid: mid, // Оригинальный mid для Max API
        ...result
      };
      // Если mid - строка, используем её как message_id для удаления
      if (mid && typeof mid === 'string') {
        returnValue.message_id = mid; // Используем mid напрямую для удаления
      }
      return returnValue;
    };
  }

  if (!extended.replyWithPhoto) {
    extended.replyWithPhoto = async (photo: any, options?: any) => {
      const photoSource = typeof photo === 'object' ? photo.source || photo.url : photo;
      console.log('[DEBUG] replyWithPhoto: отправка фото, source:', photoSource);
      
      try {
        // Пытаемся загрузить изображение через Max API
        let imageAttachmentJson: any = null;
        let uploadSucceeded = false;
        
        try {
          console.log('[DEBUG] replyWithPhoto: загрузка изображения через uploadImage');
          let uploadResult: any;
          
          if (photoSource.startsWith('http://') || photoSource.startsWith('https://')) {
            // Функция для правильного кодирования URL с кириллицей
            const encodeUrlPath = (url: string): string => {
              try {
                const urlObj = new URL(url);
                // Разбиваем путь на части
                const pathParts = urlObj.pathname.split('/');
                // Кодируем каждую часть пути, если она содержит не-ASCII символы
                const encodedPathParts = pathParts.map(part => {
                  if (!part) return part; // Пустые части оставляем как есть
                  // Проверяем, содержит ли часть не-ASCII символы (не закодированные)
                  // Если часть уже содержит %, проверяем, можно ли ее декодировать
                  if (part.includes('%')) {
                    try {
                      const decoded = decodeURIComponent(part);
                      // Если декодирование успешно, проверяем, содержит ли не-ASCII
                      if (/[^\x00-\x7F]/.test(decoded)) {
                        // Содержит не-ASCII, значит была закодирована, но неправильно
                        // Кодируем заново
                        return encodeURIComponent(decoded);
                      }
                      // Если декодирование успешно и нет не-ASCII, значит правильно закодирована
                      return part;
                    } catch {
                      // Не можем декодировать, значит уже правильно закодирована
                      return part;
                    }
                  }
                  // Если не содержит %, проверяем на не-ASCII
                  if (/[^\x00-\x7F]/.test(part)) {
                    return encodeURIComponent(part);
                  }
                  return part;
                });
                // Собираем путь обратно
                urlObj.pathname = encodedPathParts.join('/');
                return urlObj.toString();
              } catch (e) {
                console.warn('[DEBUG] replyWithPhoto: ошибка кодирования URL:', e);
                return url;
              }
            };
            
            // Пытаемся загрузить через uploadImage с исходным URL (uploadImage сам должен обработать кодирование)
            try {
              uploadResult = await ctx.api.uploadImage({ url: photoSource });
              console.log('[DEBUG] replyWithPhoto: изображение загружено (URL), результат:', uploadResult);
              
              // Проверяем, что uploadResult содержит photos или token (успешная загрузка)
              // Если только url, значит загрузка не удалась, используем URL напрямую
              if (uploadResult && !uploadResult.photos && !uploadResult.token && uploadResult.url) {
                console.log('[DEBUG] replyWithPhoto: uploadImage вернул только URL, используем URL напрямую');
                // Используем URL из результата, но проверяем, не закодирован ли он дважды
                let resultUrl = uploadResult.url;
                // Если URL содержит двойное кодирование (%25), декодируем один раз
                if (resultUrl.includes('%25')) {
                  try {
                    resultUrl = decodeURIComponent(resultUrl);
                    console.log('[DEBUG] replyWithPhoto: декодирован URL из результата:', resultUrl);
                  } catch (e) {
                    console.warn('[DEBUG] replyWithPhoto: не удалось декодировать URL из результата');
                  }
                }
                // Кодируем правильно
                const encodedUrl = encodeUrlPath(resultUrl);
                imageAttachmentJson = {
                  type: 'image',
                  payload: {
                    url: encodedUrl
                  }
                };
                uploadSucceeded = true;
                console.log('[DEBUG] replyWithPhoto: используем URL напрямую, закодированный:', encodedUrl);
                uploadResult = null; // Сбрасываем, чтобы не обрабатывать дальше
              }
            } catch (uploadError) {
              console.warn('[DEBUG] replyWithPhoto: ошибка uploadImage, используем URL напрямую:', uploadError);
              uploadResult = null; // Сбрасываем, чтобы использовать URL напрямую
            }
            
            // Если uploadResult пустой, используем URL напрямую (с правильным кодированием)
            if (!uploadResult && !imageAttachmentJson) {
              console.log('[DEBUG] replyWithPhoto: используем URL напрямую без загрузки');
              const encodedUrl = encodeUrlPath(photoSource);
              imageAttachmentJson = {
                type: 'image',
                payload: {
                  url: encodedUrl
                }
              };
              uploadSucceeded = true;
              console.log('[DEBUG] replyWithPhoto: закодированный URL для отправки:', encodedUrl);
            }
          } else {
            // Если это локальный файл, проверяем существование и используем ReadStream
            const fs = require('fs');
            const path = require('path');
            const fullPath = path.isAbsolute(photoSource) ? photoSource : path.join(process.cwd(), photoSource);
            console.log('[DEBUG] replyWithPhoto: проверка файла, полный путь:', fullPath);
            
            if (!fs.existsSync(fullPath)) {
              throw new Error(`Файл не найден: ${fullPath}`);
            }
            
            console.log('[DEBUG] replyWithPhoto: файл существует, чтение файла в Buffer и загрузка через uploadImage');
            // Читаем файл в Buffer
            const fileBuffer = fs.readFileSync(fullPath);
            console.log('[DEBUG] replyWithPhoto: файл прочитан, размер:', fileBuffer.length, 'байт');
            // Используем uploadImage с source (Buffer)
            uploadResult = await ctx.api.uploadImage({ source: fileBuffer });
            console.log('[DEBUG] replyWithPhoto: изображение загружено (локальный файл), результат:', uploadResult);
            console.log('[DEBUG] replyWithPhoto: тип результата:', typeof uploadResult, 'конструктор:', uploadResult?.constructor?.name);
          }
          
          // uploadImage возвращает ImageAttachment, проверяем его свойства
          console.log('[DEBUG] replyWithPhoto: uploadResult тип:', typeof uploadResult, 'конструктор:', uploadResult?.constructor?.name);
          console.log('[DEBUG] replyWithPhoto: uploadResult свойства:', Object.keys(uploadResult || {}));
          console.log('[DEBUG] replyWithPhoto: uploadResult.photos:', uploadResult?.photos);
          console.log('[DEBUG] replyWithPhoto: uploadResult.url:', uploadResult?.url);
          console.log('[DEBUG] replyWithPhoto: uploadResult.token:', uploadResult?.token);
          
          if (uploadResult && typeof uploadResult.toJson === 'function') {
            imageAttachmentJson = uploadResult.toJson();
            console.log('[DEBUG] replyWithPhoto: imageAttachmentJson из toJson():', JSON.stringify(imageAttachmentJson, null, 2));
            
            // Проверяем, что payload не пустой и содержит photos, url или token
            const payload = imageAttachmentJson.payload || {};
            const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
            const hasUrl = payload.url && payload.url.length > 0;
            const hasToken = payload.token && payload.token.length > 0;
            
            console.log('[DEBUG] replyWithPhoto: проверка payload - photos:', hasPhotos, 'url:', hasUrl, 'token:', hasToken);
            
            if (hasPhotos || hasUrl || hasToken) {
              uploadSucceeded = true;
              console.log('[DEBUG] replyWithPhoto: загрузка успешна, payload содержит данные');
            } else {
              console.warn('[DEBUG] replyWithPhoto: payload пустой или не содержит photos/url/token');
              console.warn('[DEBUG] replyWithPhoto: полный payload:', JSON.stringify(payload, null, 2));
              
              // Пробуем использовать свойства напрямую из uploadResult
              if (uploadResult.photos || uploadResult.url || uploadResult.token) {
                console.log('[DEBUG] replyWithPhoto: используем свойства напрямую из uploadResult');
                imageAttachmentJson = {
                  type: 'image',
                  payload: {
                    photos: uploadResult.photos,
                    url: uploadResult.url,
                    token: uploadResult.token
                  }
                };
                uploadSucceeded = true;
              }
            }
          } else if (uploadResult && !imageAttachmentJson) {
            // Проверяем напрямую свойства uploadResult
            console.log('[DEBUG] replyWithPhoto: uploadResult не имеет toJson(), проверяем свойства:', Object.keys(uploadResult));
            if (uploadResult.photos || uploadResult.url || uploadResult.token) {
              imageAttachmentJson = {
                type: 'image',
                payload: {
                  photos: uploadResult.photos,
                  url: uploadResult.url,
                  token: uploadResult.token
                }
              };
              uploadSucceeded = true;
              console.log('[DEBUG] replyWithPhoto: imageAttachmentJson из свойств uploadResult:', JSON.stringify(imageAttachmentJson, null, 2));
            } else {
              console.warn('[DEBUG] replyWithPhoto: uploadResult не содержит photos/url/token');
              console.warn('[DEBUG] replyWithPhoto: полный uploadResult:', JSON.stringify(uploadResult, null, 2));
            }
          } else if (!imageAttachmentJson && !uploadResult) {
            console.warn('[DEBUG] replyWithPhoto: uploadResult пустой или undefined');
          }
        } catch (uploadError) {
          console.error('[DEBUG] replyWithPhoto: ошибка загрузки изображения:', uploadError);
          // Если произошла ошибка и imageAttachmentJson еще не установлен, используем URL напрямую
          if (!imageAttachmentJson && (photoSource.startsWith('http://') || photoSource.startsWith('https://'))) {
            let encodedUrl = photoSource;
            try {
              const urlObj = new URL(photoSource);
              const pathParts = urlObj.pathname.split('/');
              const encodedPathParts = pathParts.map(part => {
                if (!part) return part;
                const hasNonASCII = /[^\x00-\x7F]/.test(part);
                if (hasNonASCII) {
                  return encodeURIComponent(part);
                }
                if (part.includes('%')) {
                  try {
                    const decoded = decodeURIComponent(part);
                    if (/[^\x00-\x7F]/.test(decoded)) {
                      return encodeURIComponent(decoded);
                    }
                  } catch {
                    // Уже правильно закодирована
                  }
                }
                return part;
              });
              urlObj.pathname = encodedPathParts.join('/');
              encodedUrl = urlObj.toString();
            } catch (e) {
              // Игнорируем ошибку кодирования
            }
            imageAttachmentJson = {
              type: 'image',
              payload: {
                url: encodedUrl
              }
            };
            uploadSucceeded = true;
            console.log('[DEBUG] replyWithPhoto: используем URL напрямую после ошибки');
          }
        }
        
        // Если загрузка не удалась, используем fallback
        if (!uploadSucceeded || !imageAttachmentJson || !imageAttachmentJson.payload || Object.keys(imageAttachmentJson.payload).length === 0) {
          console.log('[DEBUG] replyWithPhoto: загрузка не удалась, используем fallback');
          // Для локальных файлов fallback не сработает, нужно использовать другой подход
          // Пока просто выбросим ошибку или попробуем отправить без изображения
          throw new Error('Не удалось загрузить изображение. Проверьте путь к файлу и доступность Max API.');
        }
        
        // Преобразуем options аналогично reply
        let maxOptions: any = { ...options };
        
        // Обрабатываем reply_markup для клавиатур
        if (options?.reply_markup) {
          console.log('[DEBUG] replyWithPhoto: преобразование reply_markup в формат Max API');
          const markup = options.reply_markup;
          
          if (options.attachments) {
            maxOptions.attachments = options.attachments;
            console.log('[DEBUG] replyWithPhoto: используются attachments из options');
          } else if (markup.inline_keyboard) {
            const buttonsRows: any[][] = [];
            for (const row of markup.inline_keyboard) {
              const maxRow: any[] = [];
              for (const button of row) {
                if (button.callback_data) {
                  maxRow.push({
                    type: 'callback',
                    text: button.text,
                    payload: button.callback_data
                  });
                } else if (button.url) {
                  maxRow.push({
                    type: 'callback',
                    text: button.text,
                    payload: button.url
                  });
                }
              }
              if (maxRow.length > 0) {
                buttonsRows.push(maxRow);
              }
            }
            if (buttonsRows.length > 0) {
              maxOptions.attachments = [{
                type: 'inline_keyboard',
                payload: {
                  buttons: buttonsRows
                }
              }];
              console.log('[DEBUG] replyWithPhoto: создана inline_keyboard с', buttonsRows.length, 'рядами кнопок');
            }
          }
          delete maxOptions.reply_markup;
        }
        
        // Формируем attachments для фото
        const attachments: any[] = [];
        
        // Добавляем фото в правильном формате
        if (imageAttachmentJson && imageAttachmentJson.type === 'image' && imageAttachmentJson.payload) {
          // Проверяем, что payload содержит хотя бы одно из: photos, url, token
          const payload = imageAttachmentJson.payload;
          const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
          const hasUrl = payload.url && payload.url.length > 0;
          const hasToken = payload.token && payload.token.length > 0;
          
          if (hasPhotos || hasUrl || hasToken) {
            attachments.push(imageAttachmentJson);
            console.log('[DEBUG] replyWithPhoto: добавлено изображение из imageAttachmentJson');
          } else {
            throw new Error('imageAttachmentJson.payload не содержит photos, url или token');
          }
        } else {
          throw new Error('Не удалось получить валидный imageAttachmentJson');
        }
        
        // Добавляем клавиатуру, если есть
        if (maxOptions.attachments) {
          attachments.push(...maxOptions.attachments);
        }
        
        console.log('[DEBUG] replyWithPhoto: отправка сообщения с attachments:', JSON.stringify(attachments, null, 2));
        const result = await ctx.reply(options?.caption || '', {
          ...maxOptions,
          attachments: attachments
        });
        
        console.log('[DEBUG] replyWithPhoto: фото отправлено, message_id:', result?.body?.mid);
        return {
          message_id: parseInt(result?.body?.mid || '0') || 0,
          ...result
        };
      } catch (e) {
        console.error('[DEBUG] replyWithPhoto: ошибка отправки фото:', e);
        throw e;
      }
    };
  }

  if (!extended.replyWithMarkdownV2) {
    extended.replyWithMarkdownV2 = async (text: string, options?: any) => {
      const result = await ctx.reply(text, {
        ...options,
        format: 'markdown'
      });
      return {
        message_id: result?.body?.mid || 0,
        ...result
      };
    };
  }

  if (!extended.deleteMessage) {
    extended.deleteMessage = async (messageId: number | string) => {
      try {
        // Преобразуем в строку для Max API
        const messageIdStr = typeof messageId === 'string' ? messageId : messageId.toString();
        console.log('[DEBUG] deleteMessage: удаление сообщения, message_id:', messageIdStr);
        await ctx.deleteMessage(messageIdStr);
        console.log('[DEBUG] deleteMessage: сообщение удалено успешно');
        return true;
      } catch (e) {
        console.error('[DEBUG] deleteMessage: ошибка удаления сообщения:', e);
        return false;
      }
    };
  }

  if (!extended.deleteMessages) {
    extended.deleteMessages = async (messageIds: (number | string)[]) => {
      try {
        console.log('[DEBUG] deleteMessages: начало удаления', messageIds.length, 'сообщений');
        // Max API может не поддерживать массовое удаление, удаляем по одному
        for (const id of messageIds) {
          try {
            const messageIdStr = typeof id === 'string' ? id : id.toString();
            console.log('[DEBUG] deleteMessages: удаление сообщения', messageIdStr);
            await ctx.deleteMessage(messageIdStr);
            console.log('[DEBUG] deleteMessages: сообщение', messageIdStr, 'удалено');
          } catch (e) {
            console.error('[DEBUG] deleteMessages: ошибка удаления сообщения', id, ':', e);
            // Игнорируем ошибки при удалении отдельных сообщений
          }
        }
        console.log('[DEBUG] deleteMessages: все сообщения обработаны');
        return true;
      } catch (e) {
        console.error('[DEBUG] deleteMessages: ошибка в основном блоке:', e);
        return false;
      }
    };
  }

  if (!extended.editMessageMedia) {
    extended.editMessageMedia = async (media: any, options?: any) => {
      try {
        console.log('[DEBUG] editMessageMedia: редактирование медиа');
        const messageId = (ctx as any).messageId || (ctx as any).message?.body?.mid || (ctx as any).callback?.message?.body?.mid;
        if (!messageId) {
          console.error('[DEBUG] editMessageMedia: нет messageId');
          return false;
        }
        
        console.log('[DEBUG] editMessageMedia: messageId:', messageId);
        
        // Загружаем изображение, если нужно
        let imageAttachmentJson: any = null;
        let uploadSucceeded = false;
        
        if (media.type === 'photo' && media.media?.url) {
          try {
            // Правильное кодирование URL с кириллицей
            let encodedUrl = media.media.url;
            try {
              const urlObj = new URL(media.media.url);
              // Разбиваем путь на части
              const pathParts = urlObj.pathname.split('/');
              // Кодируем каждую часть пути, если она содержит не-ASCII символы
              const encodedPathParts = pathParts.map(part => {
                if (!part) return part; // Пустые части оставляем как есть
                // Проверяем, содержит ли часть не-ASCII символы
                const hasNonASCII = /[^\x00-\x7F]/.test(part);
                if (hasNonASCII) {
                  return encodeURIComponent(part);
                }
                // Если уже закодирована, проверяем
                if (part.includes('%')) {
                  try {
                    const decoded = decodeURIComponent(part);
                    if (/[^\x00-\x7F]/.test(decoded)) {
                      return encodeURIComponent(decoded);
                    }
                  } catch {
                    // Уже правильно закодирована
                  }
                }
                return part;
              });
              urlObj.pathname = encodedPathParts.join('/');
              encodedUrl = urlObj.toString();
              console.log('[DEBUG] editMessageMedia: URL закодирован:', encodedUrl);
            } catch (e) {
              console.warn('[DEBUG] editMessageMedia: ошибка кодирования URL, используем исходный:', e);
            }
            console.log('[DEBUG] editMessageMedia: загрузка изображения через uploadImage, URL:', encodedUrl);
            const uploadResult = await ctx.api.uploadImage({ url: encodedUrl });
            console.log('[DEBUG] editMessageMedia: изображение загружено, результат:', uploadResult);
            console.log('[DEBUG] editMessageMedia: тип результата:', typeof uploadResult, 'конструктор:', uploadResult?.constructor?.name);
            console.log('[DEBUG] editMessageMedia: свойства результата:', Object.keys(uploadResult || {}));
            
            // Обрабатываем результат аналогично replyWithPhoto
            if (uploadResult && typeof uploadResult.toJson === 'function') {
              imageAttachmentJson = uploadResult.toJson();
              console.log('[DEBUG] editMessageMedia: imageAttachmentJson из toJson():', JSON.stringify(imageAttachmentJson, null, 2));
              
              // Проверяем, что payload не пустой и содержит photos, url или token
              const payload = imageAttachmentJson.payload || {};
              const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
              const hasUrl = payload.url && payload.url.length > 0;
              const hasToken = payload.token && payload.token.length > 0;
              
              console.log('[DEBUG] editMessageMedia: проверка payload - photos:', hasPhotos, 'url:', hasUrl, 'token:', hasToken);
              
              if (hasPhotos || hasUrl || hasToken) {
                uploadSucceeded = true;
                console.log('[DEBUG] editMessageMedia: загрузка успешна, payload содержит данные');
              } else {
                console.warn('[DEBUG] editMessageMedia: payload пустой или не содержит photos/url/token');
                // Пробуем использовать свойства напрямую из uploadResult
                if (uploadResult.photos || uploadResult.url || uploadResult.token) {
                  console.log('[DEBUG] editMessageMedia: используем свойства напрямую из uploadResult');
                  imageAttachmentJson = {
                    type: 'image',
                    payload: {
                      photos: uploadResult.photos,
                      url: uploadResult.url,
                      token: uploadResult.token
                    }
                  };
                  uploadSucceeded = true;
                }
              }
            } else if (uploadResult) {
              // Проверяем напрямую свойства uploadResult
              if (uploadResult.photos || uploadResult.url || uploadResult.token) {
                imageAttachmentJson = {
                  type: 'image',
                  payload: {
                    photos: uploadResult.photos,
                    url: uploadResult.url,
                    token: uploadResult.token
                  }
                };
                uploadSucceeded = true;
                console.log('[DEBUG] editMessageMedia: imageAttachmentJson из свойств uploadResult');
              }
            }
            
            // Если загрузка не удалась, используем URL напрямую
            if (!uploadSucceeded) {
              console.log('[DEBUG] editMessageMedia: загрузка не удалась, используем URL напрямую');
              imageAttachmentJson = {
                type: 'image',
                payload: {
                  url: media.media.url
                }
              };
              uploadSucceeded = true;
            }
          } catch (uploadError) {
            console.error('[DEBUG] editMessageMedia: ошибка загрузки изображения, используем URL напрямую:', uploadError);
            // Используем URL напрямую в случае ошибки
            imageAttachmentJson = {
              type: 'image',
              payload: {
                url: media.media.url
              }
            };
            uploadSucceeded = true;
          }
        }
        
        // Преобразуем reply_markup для клавиатур
        let maxOptions: any = { ...options };
        if (options?.reply_markup) {
          const markup = options.reply_markup;
          if (markup.inline_keyboard) {
            const buttonsRows: any[][] = [];
            for (const row of markup.inline_keyboard) {
              const maxRow: any[] = [];
              for (const button of row) {
                if (button.callback_data) {
                  maxRow.push({
                    type: 'callback',
                    text: button.text,
                    payload: button.callback_data
                  });
                }
              }
              if (maxRow.length > 0) {
                buttonsRows.push(maxRow);
              }
            }
            if (buttonsRows.length > 0) {
              maxOptions.attachments = [{
                type: 'inline_keyboard',
                payload: {
                  buttons: buttonsRows
                }
              }];
              console.log('[DEBUG] editMessageMedia: создана inline_keyboard с', buttonsRows.length, 'рядами кнопок');
            }
          }
          delete maxOptions.reply_markup;
        }
        
        // Формируем body для редактирования
        const editBody: any = {};
        
        if (media.caption) {
          editBody.text = media.caption;
        }
        
        const attachments: any[] = [];
        
        // Добавляем изображение
        if (imageAttachmentJson && imageAttachmentJson.type === 'image' && imageAttachmentJson.payload) {
          // Проверяем, что payload содержит хотя бы одно из: photos, url, token
          const payload = imageAttachmentJson.payload;
          const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
          const hasUrl = payload.url && payload.url.length > 0;
          const hasToken = payload.token && payload.token.length > 0;
          
          if (hasPhotos || hasUrl || hasToken) {
            attachments.push(imageAttachmentJson);
            console.log('[DEBUG] editMessageMedia: добавлено изображение из imageAttachmentJson');
          } else {
            console.warn('[DEBUG] editMessageMedia: imageAttachmentJson.payload не содержит photos/url/token');
          }
        }
        
        // Добавляем клавиатуру, если есть
        if (maxOptions.attachments) {
          attachments.push(...maxOptions.attachments);
        }
        
        if (attachments.length > 0) {
          editBody.attachments = attachments;
        }
        
        console.log('[DEBUG] editMessageMedia: вызов ctx.editMessage с attachments:', attachments.length);
        await ctx.editMessage({
          message_id: messageId.toString(),
          ...editBody
        });
        
        console.log('[DEBUG] editMessageMedia: медиа отредактировано');
        return true;
      } catch (e) {
        console.error('[DEBUG] editMessageMedia: ошибка:', e);
        return false;
      }
    };
  }

  // leaveChat уже есть в Context, просто используем его
  if (!extended.leaveChat) {
    extended.leaveChat = ctx.leaveChat.bind(ctx);
  }

  // Добавляем callbackQuery для совместимости
  if (!extended.callbackQuery && ctx.callback) {
    extended.callbackQuery = {
      data: ctx.callback.payload || undefined
    };
  }

  // Добавляем telegram для совместимости
  if (!extended.telegram) {
    extended.telegram = {
      setMyCommands: async (commands: any[], options?: any) => {
        console.log('[DEBUG] telegram.setMyCommands: вызов, commands:', commands.length, 'options:', options);
        console.log('[DEBUG] telegram.setMyCommands: исходные команды:', JSON.stringify(commands, null, 2));
        try {
          // MAX API setMyCommands принимает команды с полем 'name', а не 'command'
          // Преобразуем команды из формата Telegram (command) в формат Max API (name)
          const maxCommands = commands.map(cmd => {
            // Если команда уже в формате Max API (с полем name), используем как есть
            if (cmd.name) {
              return { name: cmd.name, description: cmd.description || '' };
            }
            // Если команда в формате Telegram (с полем command), преобразуем
            if (cmd.command) {
              return { name: cmd.command, description: cmd.description || '' };
            }
            // Если формат неизвестен, пробуем использовать как есть
            return { name: cmd.name || cmd.command || '', description: cmd.description || '' };
          });
          
          console.log('[DEBUG] telegram.setMyCommands: преобразованные команды для Max API:', JSON.stringify(maxCommands, null, 2));
          
          // MAX API setMyCommands принимает только commands, options не поддерживаются
          // Игнорируем options и устанавливаем команды
          await ctx.api.setMyCommands(maxCommands);
          console.log('[DEBUG] telegram.setMyCommands: успешно');
        } catch (e) {
          console.error('[DEBUG] telegram.setMyCommands: ошибка:', e);
          console.error('[DEBUG] telegram.setMyCommands: stack:', e instanceof Error ? e.stack : 'нет stack');
          // Игнорируем ошибку, чтобы не ломать работу бота
        }
      }
    };
  }

  return extended;
}

