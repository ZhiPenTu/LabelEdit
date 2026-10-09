// All product services are registered as Cordis effects, so teardown is reversible.
export const name = 'commerce-platform';
export const inject = ['commerceBridge'];
const definitions = [
  ['home', '工具中心'], ['market', '插件市场'], ['plugins', '插件管理'],
  ['settings', '设置'], ['updates', '更新'], ['credentials', '凭据'], ['sandbox', '沙箱'],
];
export function apply(ctx) {
  for (const [id, title] of definitions) {
    ctx.plugin({ name: 'commerce-system-' + id, apply(child) {
      const service = Object.freeze({ id, title, protected: true,
        invoke: (method, args) => child.commerceBridge.invoke(id, method, args) });
      child.provide('commerce_' + id, service);
      child.effect(() => ctx.commerceBridge.registerSystem(service));
    }});
  }
}
