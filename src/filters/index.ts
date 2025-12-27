// Адаптеры для фильтров Telegraf

export function message(filter: string) {
  return (ctx: any) => {
    if (filter === 'text') {
      return ctx.message?.body?.text != null;
    }
    return false;
  };
}

// Экспорт для совместимости
export const filters = {
  message
};

