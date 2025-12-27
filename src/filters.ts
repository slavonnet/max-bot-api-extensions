// Фильтры для совместимости с Telegraf
export function message(type: string) {
  return (ctx: any) => {
    if (type === 'text') {
      return !!(ctx.message?.body?.text || ctx.message?.text);
    }
    return false;
  };
}




