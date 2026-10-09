import semver from 'semver';

const releaseRepository = 'https://github.com/ZhiPenTu/LabelEdit';
const latestReleaseAPI = 'https://api.github.com/repos/ZhiPenTu/LabelEdit/releases/latest';

export function releaseDownloadPage(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || !semver.valid(version) || semver.lt(version, '0.2.0')) throw new Error('底座更新版本无效。');
  return `${releaseRepository}/releases/tag/v${version}`;
}

async function releaseJSON(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GitHub 更新响应为空。');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('GitHub 更新响应过大。');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function checkGitHubRelease(currentVersion, { fetchImpl = globalThis.fetch, platform = process.platform, arch = process.arch } = {}) {
  const response = await fetchImpl(latestReleaseAPI, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return { status: 'unpublished', version: null, notes: '' };
  if (!response.ok) throw new Error(`GitHub 更新检查失败（HTTP ${response.status}），请稍后手动重试。`);
  const release = await releaseJSON(response);
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
  releaseDownloadPage(version);
  if (release.tag_name !== `v${version}` || release.draft || release.prerelease) throw new Error('GitHub 未返回正式底座版本。');
  if (!semver.gt(version, currentVersion)) return { status: 'current', version: null, notes: '' };
  const target = { 'darwin-arm64': ['mac', 'dmg'], 'win32-x64': ['win', 'exe'] }[`${platform}-${arch}`];
  if (!target) throw new Error('当前系统不支持底座更新。');
  const filename = `CommerceTools-${version}-${target[0]}-${arch}.${target[1]}`;
  if (!Array.isArray(release.assets) || !release.assets.some(asset => asset?.name === filename && asset.state === 'uploaded')) throw new Error('最新版本尚未提供当前系统的安装包。');
  return { status: 'available', version, notes: typeof release.body === 'string' ? release.body : '' };
}

export function latestReleaseNotes(info) {
  if(typeof info?.releaseNotes === 'string') return info.releaseNotes;
  if(!Array.isArray(info?.releaseNotes)) return '';
  return info.releaseNotes.find(entry => entry.version === info.version)?.note ?? '';
}
