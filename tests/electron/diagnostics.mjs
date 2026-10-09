export function observeApplication(app) {
  app.process().stdout.on('data', data => process.stdout.write(data));
  app.process().stderr.on('data', data => process.stderr.write(data));
  app.on('window', page => {
    page.on('crash', () => console.error('Renderer crashed:', page.url()));
    page.on('pageerror', error => console.error('Renderer error:', error.message));
  });
}
