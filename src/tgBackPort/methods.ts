import { Context } from '@maxhub/max-bot-api';
import { SupportTgContext } from '../tgBackPort';

// Функции-создатели методов для SupportTgContext
// Эти функции создают методы, которые заполняют SupportTgContext

// Общая функция для правильного кодирования URL с кириллицей
function encodeUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const encodedPathParts = pathParts.map(part => {
      if (!part) return part;
      if (part.includes('%')) {
        try {
          const decoded = decodeURIComponent(part);
          if (/[^\x00-\x7F]/.test(decoded)) {
            return encodeURIComponent(decoded);
          }
          return part;
        } catch {
          return part;
        }
      }
      if (/[^\x00-\x7F]/.test(part)) {
        return encodeURIComponent(part);
      }
      return part;
    });
    urlObj.pathname = encodedPathParts.join('/');
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

export function createReplyWithMarkdownV2Method(ctx: Context): (text: string, options?: any) => Promise<SupportTgContext & any> {
  return async (text: string, options?: any) => {
    // MAX API поддерживает format: 'markdown' для форматирования
    // MarkdownV2 - это расширенная версия Markdown, но MAX API может поддерживать только базовый Markdown
    // Используем format: 'markdown' для совместимости
    const maxOptions = { ...options, format: 'markdown' };
    return createReplyMethod(ctx)(text, maxOptions);
  };
}

export function createReplyMethod(ctx: Context): (text: string, options?: any) => Promise<SupportTgContext & any> {
  return async (text: string, options?: any) => {
    // Преобразуем reply_markup в формат Max API (attachments)
    let maxOptions: any = { ...options };
    
    if (options?.reply_markup) {
      const markup = options.reply_markup;
      
      // Если options уже содержит attachments (из Markup.inlineKeyboard), используем их
      if (options.attachments) {
        maxOptions.attachments = options.attachments;
      } else if (markup.inline_keyboard) {
        // Преобразуем reply_markup.inline_keyboard в формат Max API
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
        }
      }
      
      delete maxOptions.reply_markup;
    }
    // Используем ctx.reply() напрямую - он автоматически определяет, куда отправлять
    // на основе контекста (в чат или пользователю)
    // Не нужно проверять тип чата - MAX API сам определит правильный метод
    const result = await ctx.reply(text, maxOptions);
    
    const mid = result?.body?.mid;
    // Возвращаем объект с message_id и mid для совместимости с Telegraf
    // ВАЖНО: message_id должен быть равен mid (не парсим число из строки)
    // ВАЖНО: result - это объект Message из MAX API, который имеет структуру:
    // { recipient, timestamp, body: { mid, ... }, sender }
    // Нужно добавить message_id и mid в корень объекта
    // Сначала копируем result, затем добавляем message_id и mid (чтобы они не перезаписывались)
    const returnValue: any = Object.assign({}, result, {
      message_id: mid, // message_id просто равен mid
      mid: mid
    });
    return returnValue as SupportTgContext & typeof result;
  };
}

export function createReplyWithPhotoMethod(ctx: Context): (photo: any, options?: any) => Promise<SupportTgContext & any> {
  return async (photo: any, options?: any) => {
    const photoSource = typeof photo === 'object' ? photo.source || photo.url : photo;
    try {
      // СТРОГО СЛЕДУЕМ ДОКУМЕНТАЦИИ MAX API из max-bot-extensions/MAX_DOC.md
      // Для URL: await ctx.api.uploadImage({ url: 'https://...' }) → image.toJson() → attachments: [image.toJson()]
      // Для локальных файлов: await ctx.api.uploadImage({ source: '/path/to/image' }) → image.toJson() → attachments: [image.toJson()]
      
      let imageAttachment: any;
      
      if (photoSource.startsWith('http://') || photoSource.startsWith('https://')) {

        let imageAttachmentJson: any = null;
        let uploadSucceeded = false;
        
        // Пытаемся загрузить через uploadImage с исходным URL (uploadImage сам должен обработать кодирование)
        try {
          const uploadResult = await ctx.api.uploadImage({ url: photoSource });

          // Проверяем, что uploadResult содержит photos или token (успешная загрузка)
          // Если только url, значит загрузка не удалась, используем URL напрямую
          if (uploadResult && !uploadResult.photos && !uploadResult.token && uploadResult.url) {
            // Используем URL из результата, но проверяем, не закодирован ли он дважды
            let resultUrl = uploadResult.url;
            // Если URL содержит двойное кодирование (%25), декодируем один раз
            if (resultUrl.includes('%25')) {
              try {
                resultUrl = decodeURIComponent(resultUrl);
              } catch (e) {
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
          } else if (uploadResult && typeof uploadResult.toJson === 'function') {
            imageAttachmentJson = uploadResult.toJson();

            // Проверяем, что payload не пустой и содержит photos, url или token
            const payload = imageAttachmentJson.payload || {};
            const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
            const hasUrl = payload.url && payload.url.length > 0;
            const hasToken = payload.token && payload.token.length > 0;
            if (hasPhotos || hasUrl || hasToken) {
              uploadSucceeded = true;
            } else {
              // Пробуем использовать свойства напрямую из uploadResult
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
              }
            }
          } else if (uploadResult && !imageAttachmentJson) {
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
            }
          }
        } catch (uploadError: any) {
        }

        // Если uploadResult пустой или не удалось загрузить, используем URL напрямую (с правильным кодированием)
        if (!uploadSucceeded && !imageAttachmentJson) {
          const encodedUrl = encodeUrlPath(photoSource);
          imageAttachmentJson = {
            type: 'image',
            payload: {
              url: encodedUrl
            }
          };
        }
        
        // Используем imageAttachmentJson для создания финального attachment
        if (imageAttachmentJson) {
          const { ImageAttachment } = require('@maxhub/max-bot-api');
          // Если imageAttachmentJson уже содержит правильную структуру с payload, используем payload для создания ImageAttachment
          if (imageAttachmentJson.type === 'image' && imageAttachmentJson.payload) {
            // Создаем ImageAttachment из payload (может содержать url, token или photos)
            imageAttachment = new ImageAttachment(imageAttachmentJson.payload);
          } else if (imageAttachmentJson.payload?.url) {
            // Если есть только url в payload, создаем ImageAttachment с url
            imageAttachment = new ImageAttachment({ url: imageAttachmentJson.payload.url });
          } else {
            // Fallback: кодируем оригинальный URL
            imageAttachment = new ImageAttachment({ url: encodeUrlPath(photoSource) });
          }
        } else {
          // Не удалось создать imageAttachment из URL - возвращаем null
          return null as any;
        }
      } else {
        // Для локальных файлов используем uploadImage с source (согласно документации MAX API)
        const fs = require('fs');
        const path = require('path');
        const fullPath = path.isAbsolute(photoSource) ? photoSource : path.join(process.cwd(), photoSource);
        if (!fs.existsSync(fullPath)) {
          // Файл не найден - возвращаем null
          return null as any;
        }
        
        // Согласно документации: uploadImage({ source: '/path/to/image' })
        // Пробуем использовать uploadImage с source для всех типов чатов
        // Если это не работает, ошибка будет обработана при проверке результата
        
        // ВАЖНО: uploadImage вызывает upload.image(), который для локальных файлов вызывает upload()
        // upload() возвращает результат из API, который передается в new ImageAttachment(data)
        // ImageAttachment конструктор ожидает { token }, { photos } или { url }
        // Если API возвращает ошибку, она может быть в JSON ответе, а не проброшена как исключение
        
        // Пробуем разные варианты source:
        // 1. Сначала пробуем Buffer (поддерживается согласно типу FileSource = string | fs.ReadStream | Buffer) - РАБОТАЕТ!
        // 2. Если не работает, пробуем ReadStream (поддерживается согласно типу FileSource = string | fs.ReadStream | Buffer)
        // 3. Если не работает, пробуем полный путь (fullPath)
        // 4. Если не работает, пробуем относительный путь (photoSource) - может быть проблема с Windows путями
        let uploadResult: any;
        let lastError: any;
        let triedOptions: string[] = [];
        
        // Функция для проверки, является ли результат ошибкой
        const isErrorResult = (result: any): boolean => {
          return result && typeof result === 'object' && ('error_code' in result || 'error_msg' in result);
        };
        
        // Вариант 1: Buffer (РАБОТАЕТ! Используем первым)
        triedOptions.push('Buffer');
        try {
          // Читаем файл в Buffer
          const fileBuffer = fs.readFileSync(fullPath);
          // Используем uploadImage с source (Buffer)
          uploadResult = await ctx.api.uploadImage({ source: fileBuffer });
          
          // uploadImage возвращает ImageAttachment, если успешен, иначе выбросит исключение
        } catch (e1: any) {
          lastError = e1;
          uploadResult = null;
        }
        
        // Вариант 2: ReadStream (если Buffer не сработал)
        if (!uploadResult || isErrorResult(uploadResult)) {
          triedOptions.push('ReadStream');
          try {
            const readStream = fs.createReadStream(fullPath);
            uploadResult = await (ctx.api as any).upload.image({ source: readStream });
            
            if (isErrorResult(uploadResult)) {
              const errorMsg = uploadResult.error_msg || `Ошибка: ${uploadResult.error_code || 'UNKNOWN'}`;
              lastError = new Error(`Ошибка загрузки изображения через uploadImage: ${errorMsg}`);
              uploadResult = null; // Сбрасываем результат, чтобы попробовать следующий вариант
            } else {
            }
          } catch (e2: any) {
            lastError = e2;
            uploadResult = null;
          }
        }
        
        // Вариант 3: полный путь (если предыдущие не сработали)
        if (!uploadResult || isErrorResult(uploadResult)) {
          triedOptions.push(`полный путь: ${fullPath}`);
          try {
            uploadResult = await (ctx.api as any).upload.image({ source: fullPath });
            
            if (isErrorResult(uploadResult)) {
              const errorMsg = uploadResult.error_msg || `Ошибка: ${uploadResult.error_code || 'UNKNOWN'}`;
              lastError = new Error(`Ошибка загрузки изображения через uploadImage: ${errorMsg}`);
              uploadResult = null; // Сбрасываем результат, чтобы попробовать следующий вариант
            } else {
            }
          } catch (e3: any) {
            lastError = e3;
            uploadResult = null;
          }
        }
        
        // Вариант 4: относительный путь (если предыдущие не сработали)
        if (!uploadResult || isErrorResult(uploadResult)) {
          triedOptions.push(`относительный путь: ${photoSource}`);
          try {
            uploadResult = await (ctx.api as any).upload.image({ source: photoSource });
            
            if (isErrorResult(uploadResult)) {
              const errorMsg = uploadResult.error_msg || `Ошибка: ${uploadResult.error_code || 'UNKNOWN'}`;
              lastError = new Error(`Ошибка загрузки изображения через uploadImage: ${errorMsg}`);
              uploadResult = null;
            } else {
            }
          } catch (e4: any) {
            lastError = e4;
            uploadResult = null;
          }
        }
        
        // Если все попытки не сработали, возвращаем null
        if (!uploadResult || isErrorResult(uploadResult)) {
          return null as any;
        }
        
        // Если попытка 1 (Buffer) была успешна, uploadResult уже содержит ImageAttachment
        // Для остальных попыток нужно создать ImageAttachment из результата
        if (triedOptions[0] === 'Buffer' && uploadResult) {
          // uploadImage уже вернул ImageAttachment, используем его напрямую
          imageAttachment = uploadResult;
        } else {
          // Для остальных попыток создаем ImageAttachment из результата
          const { ImageAttachment } = require('@maxhub/max-bot-api');
          imageAttachment = new ImageAttachment(uploadResult);
        }
        
        // ImageAttachment уже создан выше (для Buffer через uploadImage) или создан из uploadResult (для остальных вариантов)
        
        // Логируем структуру imageAttachment для отладки
      }
      
      // Согласно документации: image.toJson() → attachments: [image.toJson()]
      if (!imageAttachment || typeof imageAttachment.toJson !== 'function') {
        return null as any;
      }
      
      const imageAttachmentJson = imageAttachment.toJson();
      // Проверяем, что payload не пустой
      if (!imageAttachmentJson.payload || Object.keys(imageAttachmentJson.payload).length === 0) {
        return null as any;
      }
      
      // Проверяем, что toJson() вернул правильную структуру
      // Согласно документации MAX API, attachments должны содержать объекты с type и payload
      // ВАЖНО: payload должен содержать хотя бы одно из полей: token, url или photos
      let finalImageAttachment: any = imageAttachmentJson;
      
      // Проверяем, что payload не пустой и содержит нужные поля
      const hasValidPayload = imageAttachmentJson?.payload && 
                              (imageAttachmentJson.payload.token || 
                               imageAttachmentJson.payload.url || 
                               imageAttachmentJson.payload.photos);
      
      // Если toJson() не вернул правильную структуру или payload пустой, пробуем использовать сам объект imageAttachment
      if (!imageAttachmentJson || !imageAttachmentJson.type || !hasValidPayload) {
        // Формируем правильную структуру вручную на основе полей imageAttachment
        if (imageAttachment.token || imageAttachment.url || imageAttachment.photos) {
          finalImageAttachment = {
            type: 'image',
            payload: {}
          };
          if (imageAttachment.token) {
            finalImageAttachment.payload.token = imageAttachment.token;
          }
          if (imageAttachment.url) {
            finalImageAttachment.payload.url = imageAttachment.url;
          }
          if (imageAttachment.photos) {
            finalImageAttachment.payload.photos = imageAttachment.photos;
          }
        } else {
          // Если и в imageAttachment нет нужных полей, значит uploadImage не сработал
          return null as any;
        }
      }
      
      // Преобразуем reply_markup в формат Max API (attachments)
      let maxOptions: any = { ...options };
      const attachments: any[] = [finalImageAttachment];
      
      // ВАЖНО: если options.attachments уже есть (например, из editMessageMedia), используем их
      if (options?.attachments && Array.isArray(options.attachments)) {
        attachments.push(...options.attachments);
      } else if (options?.reply_markup) {
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
            attachments.push({
              type: 'inline_keyboard',
              payload: {
                buttons: buttonsRows
              }
            });
          }
        }
        delete maxOptions.reply_markup;
      }
      
      maxOptions.attachments = attachments;
      
      
      // Используем ctx.reply() напрямую - он автоматически определяет, куда отправлять
      // на основе контекста (в чат или пользователю)
      // Не нужно проверять тип чата - MAX API сам определит правильный метод
      const caption = options?.caption || '';
      const result = await ctx.reply(caption, maxOptions);
      
      const mid = result?.body?.mid;
      // Возвращаем объект с message_id и mid для совместимости
      // ВАЖНО: message_id должен быть равен mid (не парсим число из строки)
      const returnValue: any = Object.assign({}, result, {
        message_id: mid, // message_id просто равен mid
        mid: mid
      });
      
      return returnValue as SupportTgContext & typeof result;
    } catch (e) {
      // В случае ошибки возвращаем null вместо проброса
      return null as any;
    }
  };
}

export function createDeleteMessageMethod(ctx: Context): (messageId: number | string) => Promise<boolean> {
  return async (messageId: number | string) => {
    try {
      const messageIdStr = typeof messageId === 'string' ? messageId : messageId.toString();
      await ctx.deleteMessage(messageIdStr);
      return true;
    } catch (e) {
      return false;
    }
  };
}

export function createEditMessageMediaMethod(ctx: Context): (media: any, options?: any) => Promise<boolean> {
  return async (media: any, options?: any) => {
    // СТРОГО СЛЕДУЕМ ДОКУМЕНТАЦИИ MAX API
    // Используем ctx.api.editMessage для редактирования сообщений
    try {
      // Получаем mid текущего сообщения из ctx
      // В MAX API при callback запросе ctx.message содержит сообщение, на которое был нажат callback
      // Это и есть сообщение, которое нужно отредактировать
      const currentMid = ctx.message?.body?.mid || (ctx.message as any)?.mid || (ctx as any).mid;
      if (!currentMid) {
        return false;
      }
      
      const messageId = String(currentMid);
      
      // Обрабатываем медиа
      if (media?.type === 'photo' && media?.media?.url) {
        const photoUrl = media.media.url;
        const caption = media.caption || options?.caption || '';
        
        let imageAttachmentJson: any = null;
        let uploadSucceeded = false;
        
        // Пытаемся загрузить через uploadImage с исходным URL
        try {
          const uploadResult = await ctx.api.uploadImage({ url: photoUrl });

          // Проверяем, что uploadResult содержит photos или token (успешная загрузка)
          // Если только url, значит загрузка не удалась, используем URL напрямую
          if (uploadResult && !uploadResult.photos && !uploadResult.token && uploadResult.url) {
            let resultUrl = uploadResult.url;
            // Если URL содержит двойное кодирование (%25), декодируем один раз
            if (resultUrl.includes('%25')) {
              try {
                resultUrl = decodeURIComponent(resultUrl);
              } catch (e) {
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
          } else if (uploadResult && typeof uploadResult.toJson === 'function') {
            imageAttachmentJson = uploadResult.toJson();

            const payload = imageAttachmentJson.payload || {};
            const hasPhotos = payload.photos && Object.keys(payload.photos).length > 0;
            const hasUrl = payload.url && payload.url.length > 0;
            const hasToken = payload.token && payload.token.length > 0;

            if (hasPhotos || hasUrl || hasToken) {
              uploadSucceeded = true;
            } else {
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
              }
            }
          } else if (uploadResult && !imageAttachmentJson) {
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
            }
          }
        } catch (uploadError: any) {
        }

        // Если uploadResult пустой или не удалось загрузить, используем URL напрямую (с правильным кодированием)
        if (!uploadSucceeded && !imageAttachmentJson) {
          const encodedUrl = encodeUrlPath(photoUrl);
          imageAttachmentJson = {
            type: 'image',
            payload: {
              url: encodedUrl
            }
          };
        }
        
        if (!imageAttachmentJson) {
          return false;
        }
        // Преобразуем reply_markup в формат Max API (attachments)
        const attachments: any[] = [imageAttachmentJson];
        
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
              attachments.push({
                type: 'inline_keyboard',
                payload: {
                  buttons: buttonsRows
                }
              });
            }
          }
        }
        
        // Используем ctx.api.editMessage для редактирования сообщения
        // Согласно сигнатуре: editMessage(messageId: string, extra?: EditMessageExtra)
        await ctx.api.editMessage(messageId, {
          attachments: attachments,
          text: caption || ''
        });
        return true;
      } else if (media?.type === 'text' && media?.text) {
        // Если это текстовое сообщение
        const text = media.text;
        const attachments: any[] = [];
        
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
              attachments.push({
                type: 'inline_keyboard',
                payload: {
                  buttons: buttonsRows
                }
              });
            }
          }
        }
        
        // Используем ctx.api.editMessage для редактирования текстового сообщения
        await ctx.api.editMessage(messageId, {
          text: text,
          attachments: attachments.length > 0 ? attachments : undefined
        });
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  };
}

export function createDeleteMessagesMethod(ctx: Context): (messageIds: (number | string)[]) => Promise<boolean> {
  return async (messageIds: (number | string)[]) => {
    try {
      for (const id of messageIds) {
        try {
          const messageIdStr = typeof id === 'string' ? id : id.toString();
          await ctx.deleteMessage(messageIdStr);
        } catch (e) {
          // Игнорируем ошибки отдельных сообщений
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  };
}

export function createLeaveChatMethod(ctx: Context): () => Promise<any> {
  return async () => {
    return ctx.leaveChat?.();
  };
}
