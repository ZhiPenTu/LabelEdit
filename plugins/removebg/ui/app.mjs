const bridge = globalThis.commercePlugin;
const $ = id => document.getElementById(id);
let input, output, busy = false;
function message(value, error = false) { $('status').textContent = value; $('status').classList.toggle('error', error); }
function controls() { $('pick').disabled = busy; $('run').disabled = busy || !input; $('cancel').disabled = !busy; $('download').disabled = busy || !output; }
async function preview(token, target) { const value = await bridge.invoke('files.read', { token: token.token }); $(target).src = 'data:' + value.mime + ';base64,' + value.data; $(target).hidden = false; $(target + '-empty').hidden = true; }
async function credentialStatus() { $('key-status').textContent = await bridge.invoke('credentials.status', { name: 'removebg' }) ? '已保存密钥。调用费用由你的 remove.bg 账户承担。' : '尚未配置密钥。'; }
$('save-key').onclick = async () => { try { await bridge.invoke('credentials.set', { name: 'removebg', value: $('key').value.trim() }); $('key').value = ''; await credentialStatus(); } catch (e) { message(e.message, true); } };
$('clear-key').onclick = async () => { try { await bridge.invoke('credentials.clear', { name: 'removebg' }); await credentialStatus(); } catch (e) { message(e.message, true); } };
$('pick').onclick = async () => { try { const selected = await bridge.invoke('files.pick', { extensions: ['png', 'jpg', 'jpeg', 'webp'] }); if (!selected) return; input = selected; output = null; $('result').hidden = true; $('result-empty').hidden = false; await preview(input, 'original'); controls(); message(input.name + ' · 图片将上传至 remove.bg'); } catch (e) { message(e.message, true); } };
$('run').onclick = async () => { busy = true; controls(); message('正在上传并抠图…'); try { output = await bridge.invoke('network.request', { url: 'https://api.remove.bg/v1.0/removebg', fileToken: input.token, credential: 'removebg', taskId: 'cutout' }); await preview(output, 'result'); message('抠图完成，可以保存透明 PNG。'); } catch (e) { message(e.message, true); } finally { busy = false; controls(); } };
$('cancel').onclick = () => void bridge.invoke('tasks.cancel', { id: 'cutout' });
$('download').onclick = async () => { try { if (await bridge.invoke('files.save', { token: output.token, filename: output.name })) message('透明 PNG 已保存。'); } catch (e) { message(e.message, true); } };
bridge.onDispose(() => { $('original').removeAttribute('src'); $('result').removeAttribute('src'); });
credentialStatus().catch(e => message(e.message, true));
