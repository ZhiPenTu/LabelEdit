"""Line-delimited JSON RPC. No sockets; all PDF operations stay in the sandbox."""
from __future__ import annotations
import base64
import json
from pathlib import Path
import sys
_protocol = sys.stdout
sys.stdout = sys.stderr
_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
from backend import server

def binary(response):
    return {"data": base64.b64encode(response.body).decode("ascii"), "mime": response.media_type}

def dispatch(method, args):
    server.store.cleanup()
    if method == "health":
        return server.health()
    if method == "upload":
        data = args.get("data", "")
        if not isinstance(data, str) or len(data) > 36_000_000:
            raise ValueError("PDF 文件不能超过 25 MB。")
        return server.store.add(base64.b64decode(data, validate=True), args.get("filename", "document.pdf"))
    if method == "demo":
        return server.load_demo()
    if method == "close":
        server.store.delete(args["id"])
        return None
    if method == "image":
        return binary(server.page_image(args["id"], args["page"]))
    if method == "recognize":
        return server.recognize(args["id"], args["page"], server.RecognizeBody.model_validate({"language": args.get("language", "latin")}))
    if method == "preview":
        return binary(server.preview(args["id"], server.PreviewBody.model_validate({"page": args["page"], "edits": args.get("edits", [])})))
    if method == "export":
        return binary(server.export(args["id"], server.ExportBody.model_validate({"edits": args.get("edits", [])})))
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
    server.store.documents.clear()
    server.store._temporary.cleanup()

if __name__ == "__main__":
    main()
