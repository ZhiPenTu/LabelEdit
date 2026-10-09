export function createPluginClient(bridge = globalThis.commercePlugin) {
  if (!bridge) throw new Error('请在电商工具中心打开此插件。');
  const invoke = (method, args = {}) => bridge.invoke(method, args);
  return Object.freeze({
    invoke,
    files: { pick: options => invoke('files.pick', options), read: token => invoke('files.read', { token }),
      save: (token, filename) => invoke('files.save', { token, filename }) },
    credentials: { set: (name, value) => invoke('credentials.set', { name, value }),
      status: name => invoke('credentials.status', { name }), clear: name => invoke('credentials.clear', { name }) },
    network: { request: options => invoke('network.request', options) },
    services: { call: (service, method, args) => invoke('services.call', { service, method, args }) },
    tasks: { cancel: id => invoke('tasks.cancel', { id }) },
    registerTool: value => invoke('contributions.tool', value),
    registerSettings: value => invoke('contributions.settings', value),
    onDispose: callback => bridge.onDispose(callback),
  });
}
