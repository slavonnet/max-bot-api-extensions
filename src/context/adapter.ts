// УДАЛЕНО: ExtendedContext и extendContext больше не используются
// Вместо них используется SupportTgContext и tgBackPort.middleware()
// Все методы теперь создаются через tgBackPort/methods.ts и присваиваются в tgBackPort.middleware()

// Экспортируем SupportTgContext из tgBackPort для обратной совместимости
export { SupportTgContext } from '../tgBackPort';
