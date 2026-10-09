export function desktopSigningMode(env = process.env) {
  const mode = env.COMMERCE_DESKTOP_SIGNING || 'unsigned';
  if (!['unsigned', 'signed'].includes(mode)) throw new Error('桌面签名模式必须为 unsigned 或 signed。');
  return mode;
}

export function packagingOptions(mode, platform = process.platform, directoryOnly = false) {
  desktopSigningMode({ COMMERCE_DESKTOP_SIGNING: mode });
  if (!['darwin', 'win32'].includes(platform)) throw new Error('仅支持 macOS 和 Windows 打包。');
  return [
    platform === 'darwin' ? '--mac' : '--win',
    platform === 'darwin' ? '--arm64' : '--x64',
    ...(directoryOnly ? ['--dir'] : []),
    '--publish', 'never', '--config',
    mode === 'signed' ? 'electron-builder.signed.yml' : 'electron-builder.yml',
  ];
}

export function packagingEnvironment(mode, source = process.env) {
  desktopSigningMode({ COMMERCE_DESKTOP_SIGNING: mode });
  const env = { ...source, COMMERCE_DESKTOP_SIGNING: mode };
  if (mode === 'unsigned') {
    // A configured certificate must not silently change an unsigned build.
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_WIN_LINK', 'CSC_WIN_KEY_PASSWORD', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) delete env[name];
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    env.CSC_FOR_PULL_REQUEST = 'true';
  }
  return env;
}
