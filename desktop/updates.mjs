export function latestReleaseNotes(info) {
  if(typeof info?.releaseNotes === 'string') return info.releaseNotes;
  if(!Array.isArray(info?.releaseNotes)) return '';
  return info.releaseNotes.find(entry => entry.version === info.version)?.note ?? '';
}
