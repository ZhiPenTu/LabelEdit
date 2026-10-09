export function observeApplication(app) {
  app.process().stdout.on('data', data => process.stdout.write(data));
  app.process().stderr.on('data', data => process.stderr.write(data));
  app.on('window', page => {
    page.on('crash', () => console.error('Renderer crashed:', page.url()));
    page.on('pageerror', error => console.error('Renderer error:', error.message));
    page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()));
  });
}
export async function tracePluginLoads(app) {
  await app.evaluate(({app,netLog}, directory) => {
    void netLog.startLogging(directory + '/netlog.json');
    app.on('web-contents-created', (_event, contents) => {
      for (const name of ['did-start-navigation','did-frame-navigate','did-frame-finish-load','did-fail-provisional-load','did-fail-load','destroyed'])
        contents.on(name, (_event, ...args) => console.log('Navigation trace:', contents.id, name, args));
    });
  }, process.cwd() + '/output/electron-tests');
}
