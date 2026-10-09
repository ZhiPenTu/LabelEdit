"""Line-delimited JSON RPC. No sockets; all PDF operations stay in the sandbox."""
from __future__ import annotations
import base64
import json
from pathlib import Path
import sys
for stream in (sys.stdin, sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8")
# Python's Windows mode=0700 builds a protected user/admin-only DACL. Inside
# AppContainer that discards the private job's inherited package-SID grant.
# Preserve the host's restricted inherited ACL on new directories instead.
if sys.platform == "win32":
    import os
    _mkdir = os.mkdir
    def _sandbox_mkdir(path, mode=0o777, *, dir_fd=None):
        return _mkdir(path, 0o777 if mode == 0o700 else mode, dir_fd=dir_fd)
    os.mkdir = _sandbox_mkdir
_protocol = sys.stdout
sys.stdout = sys.stderr
_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
from backend import document_service as documents

def binary(response):
    return {"data": base64.b64encode(response.body).decode("ascii"), "mime": response.media_type}

def dispatch(method, args):
    documents.store.cleanup()
    if method == "health":
        return documents.health()
    if method == "upload":
        data = args.get("data", "")
        if not isinstance(data, str) or len(data) > 36_000_000:
            raise ValueError("PDF 文件不能超过 25 MB。")
        return documents.store.add(base64.b64decode(data, validate=True), args.get("filename", "document.pdf"))
    if method == "demo":
        return documents.load_demo()
    if method == "close":
        documents.store.delete(args["id"])
        return None
    if method == "image":
        return binary(documents.page_image(args["id"], args["page"]))
    if method == "recognize":
        return documents.recognize(args["id"], args["page"], documents.RecognizeBody.model_validate({"language": args.get("language", "latin")}))
    if method == "preview":
        return binary(documents.preview(args["id"], documents.PreviewBody.model_validate({"page": args["page"], "edits": args.get("edits", [])})))
    if method == "export":
        return binary(documents.export(args["id"], documents.ExportBody.model_validate({"edits": args.get("edits", [])})))
    raise ValueError("不支持的插件方法。")

def main():
    for line in sys.stdin:
        request = {}
        try:
            if len(line) > 37_000_000:
                raise ValueError("请求内容过大。")
            request = json.loads(line)
            result = dispatch(request["method"], request.get("args", {}))
            reply = {"id": request["id"], "result": result}
        except Exception as error:
            detail = getattr(error, "detail", str(error))
            reply = {"id": request.get("id"), "error": detail if isinstance(detail, str) else "请求参数无效。"}
        _protocol.write(json.dumps(reply, ensure_ascii=False) + "\n")
        _protocol.flush()
    documents.store.documents.clear()
    documents.store._temporary.cleanup()

if __name__ == "__main__":
    main()
