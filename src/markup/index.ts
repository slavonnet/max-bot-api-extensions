export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: string[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export namespace Markup {
  // Преобразуем Telegraf формат в Max API формат
  export function inlineKeyboard(buttons: InlineKeyboardButton[][]): { reply_markup: InlineKeyboardMarkup, attachments: Array<{ type: 'inline_keyboard', payload: { buttons: any[][] } }> } {
    // Преобразуем кнопки в формат Max API
    // Max API ожидает массив массивов кнопок типа Button[][]
    const maxButtonsArray: any[][] = [];
    
    for (const row of buttons) {
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
        maxButtonsArray.push(maxRow);
      }
    }
    
    // Возвращаем оба формата для совместимости
    return {
      reply_markup: {
        inline_keyboard: buttons
      },
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: maxButtonsArray // Max API ожидает массив массивов
        }
      }]
    };
  }

  export function keyboard(buttons: string[][]): { reply_markup: ReplyKeyboardMarkup } & { resize: () => { reply_markup: ReplyKeyboardMarkup } } {
    const result = {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true
      }
    };
    return Object.assign(result, {
      resize: () => result
    });
  }

  export function removeKeyboard(): { reply_markup: { remove_keyboard: true } } {
    return {
      reply_markup: {
        remove_keyboard: true
      } as any
    };
  }

  export namespace button {
    export function callback(text: string, data: string): InlineKeyboardButton {
      return {
        text,
        callback_data: data
      };
    }

    export function url(text: string, url: string): InlineKeyboardButton {
      return {
        text,
        url
      };
    }

    export function text(text: string): string {
      return text;
    }

    export function contactRequest(text: string): string {
      return text; // Для Max нужно будет адаптировать
    }
  }
}

