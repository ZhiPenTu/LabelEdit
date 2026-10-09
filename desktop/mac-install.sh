#!/bin/sh
# Trusted main process supplies absolute paths as separate arguments.
trap '' HUP
parent="$1"; target="$2"; prepared="$3"; staging="$4"; receipt="$5"; profile="$6"
backup="$staging/previous.app"
fail() { printf '%s\n' "$1" > "$receipt"; exit 1; }
printf 'ready\n'
attempt=0
while kill -0 "$parent" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 120 ] || fail '等待应用退出超时，请重新下载更新。'
  sleep 1
done
/bin/mv "$target" "$backup" || fail '无法替换旧应用，请检查应用文件夹权限。'
if ! /bin/mv "$prepared" "$target"; then
  /bin/mv "$backup" "$target"
  printf '%s\n' '更新安装失败，已尝试恢复原版本。' > "$receipt"
  /usr/bin/open -n "$target" --args "--user-data-dir=$profile"
  exit 1
fi
if ! /usr/bin/open -n "$target" --args "--user-data-dir=$profile"; then
  /bin/mv "$target" "$prepared"
  /bin/mv "$backup" "$target"
  printf '%s\n' '新版启动失败，已尝试恢复原版本。' > "$receipt"
  /usr/bin/open -n "$target" --args "--user-data-dir=$profile"
  exit 1
fi
/bin/rm -f "$receipt"
/bin/rm -rf "$staging"
