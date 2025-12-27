// Расширение контекста для работы со сценами
export interface SceneContextScene<TContext = any> {
  enter(sceneId: string): Promise<void>;
  leave(): Promise<void>;
  reenter(): Promise<void>;
  current(): string | null;
}

// Функция для создания scene контекста
export function createSceneContext<TContext = any>(ctx: TContext, stage: any): SceneContextScene<TContext> {
  return {
    async enter(sceneId: string) {
      (ctx as any).session = (ctx as any).session || {};
      (ctx as any).session.scene = sceneId;
      const scene = stage.getScene(sceneId);
      if (scene) {
        await scene.handleEnter(ctx);
      }
    },
    async leave() {
      const currentSceneId = (ctx as any).session?.scene;
      if (currentSceneId) {
        const scene = stage.getScene(currentSceneId);
        if (scene) {
          await scene.handleLeave(ctx);
        }
        (ctx as any).session.scene = null;
      }
    },
    async reenter() {
      const currentSceneId = (ctx as any).session?.scene;
      if (currentSceneId) {
        await this.leave();
        await this.enter(currentSceneId);
      }
    },
    current(): string | null {
      return (ctx as any).session?.scene || null;
    }
  };
}

