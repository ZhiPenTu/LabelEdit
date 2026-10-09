export async function checkBackendHealth(): Promise<{ ready: boolean; error?: string }> {
  try {
    if (!window.commercePlugin) throw new Error('请从工具中心打开 LabelEdit。');
    return await window.commercePlugin.invoke('services.call', { service: 'labeledit.pdf', method: 'health' });
  } catch (error) {
    return { ready: false, error: error instanceof Error ? error.message : '无法连接到本地服务。' };
  }
}
