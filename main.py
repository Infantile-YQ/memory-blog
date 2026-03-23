import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("BLOG_DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "blog.db"
BACKUP_PATH = DATA_DIR / "blog_backup.json"
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


class BlogDatabase:
    def __init__(self, db_path: Path, backup_path: Path):
        self.db_path = db_path
        self.backup_path = backup_path
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self.export_backup()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id TEXT PRIMARY KEY,
                    background_color TEXT NOT NULL,
                    background_image TEXT NOT NULL,
                    font_family TEXT NOT NULL,
                    font_size INTEGER NOT NULL,
                    font_color TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    content TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS app_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def export_backup(self) -> None:
        with self.connect() as conn:
            users = [dict(row) for row in conn.execute("SELECT id, username, created_at FROM users ORDER BY created_at DESC")]
            settings = [dict(row) for row in conn.execute("SELECT * FROM user_settings")]
            posts = [dict(row) for row in conn.execute("SELECT * FROM posts ORDER BY updated_at DESC")]
            config = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM app_config")}

        backup = {
            "exported_at": utc_now(),
            "users": users,
            "settings": settings,
            "posts": posts,
            "config": config,
        }
        self.backup_path.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")

    def create_user(self, username: str, password: str) -> dict:
        user_id = secrets.token_hex(16)
        created_at = utc_now()
        with self.connect() as conn:
            existing = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
            if existing:
                raise ValueError("用户名已存在，请更换")
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, username, hash_password(password), created_at),
            )
            conn.execute(
                """
                INSERT INTO user_settings
                (user_id, background_color, background_image, font_family, font_size, font_color)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, "#f5efe5", "", "'Outfit', sans-serif", 16, "#2a1f1a"),
            )
        self.export_backup()
        return self.get_user_by_id(user_id)

    def authenticate_user(self, username: str, password: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        if not row or row["password_hash"] != hash_password(password):
            return None
        return self.get_user_by_id(row["id"])

    def get_user_by_id(self, user_id: str) -> dict | None:
        with self.connect() as conn:
            user = conn.execute("SELECT id, username, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
            if not user:
                return None
            settings = conn.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
            posts = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM posts WHERE user_id = ? ORDER BY updated_at DESC",
                    (user_id,),
                )
            ]

        return {
            "id": user["id"],
            "username": user["username"],
            "createdAt": user["created_at"],
            "settings": {
                "backgroundColor": settings["background_color"],
                "backgroundImage": settings["background_image"],
                "fontFamily": settings["font_family"],
                "fontSize": settings["font_size"],
                "fontColor": settings["font_color"],
            },
            "posts": [
                {
                    "id": post["id"],
                    "title": post["title"],
                    "summary": post["summary"],
                    "content": post["content"],
                    "status": post["status"],
                    "createdAt": post["created_at"],
                    "updatedAt": post["updated_at"],
                    "publishedAt": post["published_at"],
                }
                for post in posts
            ],
        }

    def create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        with self.connect() as conn:
            conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, utc_now()))
        return token

    def get_user_by_session(self, token: str | None) -> dict | None:
        if not token:
            return None
        with self.connect() as conn:
            row = conn.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
        if not row:
            return None
        return self.get_user_by_id(row["user_id"])

    def clear_session(self, token: str | None) -> None:
        if not token:
            return
        with self.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def save_post(self, user_id: str, payload: dict) -> None:
        now = utc_now()
        post_id = payload.get("id") or secrets.token_hex(16)
        title = payload["title"].strip()
        summary = payload.get("summary", "").strip()
        content = payload["content"].strip()
        status = payload["status"]

        if not title:
            raise ValueError("请先填写文章标题")
        if not content or content == "<br>":
            raise ValueError("请先写一点正文内容")

        with self.connect() as conn:
            existing = conn.execute(
                "SELECT created_at, published_at FROM posts WHERE id = ? AND user_id = ?",
                (post_id, user_id),
            ).fetchone()
            if existing:
                published_at = existing["published_at"] or (now if status == "published" else "")
                conn.execute(
                    """
                    UPDATE posts
                    SET title = ?, summary = ?, content = ?, status = ?, updated_at = ?, published_at = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (title, summary, content, status, now, published_at, post_id, user_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO posts
                    (id, user_id, title, summary, content, status, created_at, updated_at, published_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (post_id, user_id, title, summary, content, status, now, now, now if status == "published" else ""),
                )
        self.export_backup()

    def delete_post(self, user_id: str, post_id: str) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM posts WHERE id = ? AND user_id = ?", (post_id, user_id))
        self.export_backup()

    def update_settings(self, user_id: str, settings: dict) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE user_settings
                SET background_color = ?, background_image = ?, font_family = ?, font_size = ?, font_color = ?
                WHERE user_id = ?
                """,
                (
                    settings["backgroundColor"],
                    settings["backgroundImage"],
                    settings["fontFamily"],
                    int(settings["fontSize"]),
                    settings["fontColor"],
                    user_id,
                ),
            )
        self.export_backup()

    def change_password(self, user_id: str, old_password: str, new_password: str) -> None:
        with self.connect() as conn:
            row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row or row["password_hash"] != hash_password(old_password):
                raise ValueError("旧密码不正确")
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), user_id))
        self.export_backup()

    def get_site_url(self) -> str:
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM app_config WHERE key = 'site_url'").fetchone()
        return row["value"] if row else ""

    def set_site_url(self, url: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO app_config (key, value) VALUES ('site_url', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (url,),
            )
        self.export_backup()


DB = BlogDatabase(DB_PATH, BACKUP_PATH)


public_site_url = os.environ.get("PUBLIC_SITE_URL", "").strip()
if public_site_url and not DB.get_site_url():
    DB.set_site_url(public_site_url)


class AppHandler(BaseHTTPRequestHandler):
    server_version = "MemoryBlog/2.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        self.handle_api_write("POST")

    def do_PUT(self) -> None:
        self.handle_api_write("PUT")

    def do_DELETE(self) -> None:
        self.handle_api_write("DELETE")

    def handle_api_get(self, parsed) -> None:
        if parsed.path == "/api/me":
            user = self.require_user()
            if not user:
                return
            self.send_json({"user": user, "siteUrl": DB.get_site_url(), "backupPath": str(BACKUP_PATH)})
            return

        if parsed.path == "/api/access":
            self.send_json({"siteUrl": DB.get_site_url(), "backupPath": str(BACKUP_PATH)})
            return

        self.send_json({"error": "接口不存在"}, status=HTTPStatus.NOT_FOUND)

    def handle_api_write(self, method: str) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/register" and method == "POST":
            data = self.read_json()
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))
            confirm_password = str(data.get("confirmPassword", ""))

            if not username or not password:
                self.send_json({"error": "请输入完整的用户名和密码"}, status=HTTPStatus.BAD_REQUEST)
                return
            if len(password) < 6:
                self.send_json({"error": "密码至少需要 6 位"}, status=HTTPStatus.BAD_REQUEST)
                return
            if password != confirm_password:
                self.send_json({"error": "两次输入的密码不一致"}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                user = DB.create_user(username, password)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return

            token = DB.create_session(user["id"])
            self.send_json({"user": user, "siteUrl": DB.get_site_url(), "backupPath": str(BACKUP_PATH)}, set_cookie=token)
            return

        if parsed.path == "/api/login" and method == "POST":
            data = self.read_json()
            user = DB.authenticate_user(str(data.get("username", "")).strip(), str(data.get("password", "")))
            if not user:
                self.send_json({"error": "用户名或密码错误"}, status=HTTPStatus.UNAUTHORIZED)
                return
            token = DB.create_session(user["id"])
            self.send_json({"user": user, "siteUrl": DB.get_site_url(), "backupPath": str(BACKUP_PATH)}, set_cookie=token)
            return

        if parsed.path == "/api/logout" and method == "POST":
            DB.clear_session(self.session_token())
            self.send_json({"ok": True}, clear_cookie=True)
            return

        if parsed.path == "/api/posts" and method == "POST":
            user = self.require_user()
            if not user:
                return
            try:
                DB.save_post(user["id"], self.read_json())
            except ValueError as exc:
                self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return
            self.send_json({"user": DB.get_user_by_id(user["id"])})
            return

        if parsed.path.startswith("/api/posts/") and method == "DELETE":
            user = self.require_user()
            if not user:
                return
            post_id = parsed.path.split("/")[-1]
            DB.delete_post(user["id"], post_id)
            self.send_json({"user": DB.get_user_by_id(user["id"])})
            return

        if parsed.path == "/api/settings" and method == "PUT":
            user = self.require_user()
            if not user:
                return

            data = self.read_json()
            change = data.get("passwordChange")
            if change:
                if not change["oldPassword"] or not change["newPassword"] or not change["confirmNewPassword"]:
                    self.send_json({"error": "修改密码时请完整填写三项内容"}, status=HTTPStatus.BAD_REQUEST)
                    return
                if change["newPassword"] != change["confirmNewPassword"]:
                    self.send_json({"error": "两次输入的新密码不一致"}, status=HTTPStatus.BAD_REQUEST)
                    return
                if len(change["newPassword"]) < 6:
                    self.send_json({"error": "新密码至少需要 6 位"}, status=HTTPStatus.BAD_REQUEST)
                    return

            DB.update_settings(user["id"], data["settings"])
            if change:
                try:
                    DB.change_password(user["id"], change["oldPassword"], change["newPassword"])
                except ValueError as exc:
                    self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                    return

            self.send_json({"user": DB.get_user_by_id(user["id"])})
            return

        if parsed.path == "/api/access" and method == "PUT":
            data = self.read_json()
            DB.set_site_url(str(data.get("siteUrl", "")).strip())
            self.send_json({"siteUrl": DB.get_site_url(), "backupPath": str(BACKUP_PATH)})
            return

        self.send_json({"error": "接口不存在"}, status=HTTPStatus.NOT_FOUND)

    def serve_static(self, path: str) -> None:
        relative = STATIC_FILES.get(path)
        if not relative:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        file_path = BASE_DIR / relative
        body = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def session_token(self) -> str | None:
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        cookies = SimpleCookie()
        cookies.load(cookie_header)
        if "session_token" not in cookies:
            return None
        return cookies["session_token"].value

    def require_user(self) -> dict | None:
        user = DB.get_user_by_session(self.session_token())
        if not user:
            self.send_json({"error": "请先登录"}, status=HTTPStatus.UNAUTHORIZED)
            return None
        return user

    def send_json(
        self,
        payload: dict,
        status: HTTPStatus = HTTPStatus.OK,
        set_cookie: str | None = None,
        clear_cookie: bool = False,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if set_cookie:
            self.send_header("Set-Cookie", f"session_token={set_cookie}; Path=/; HttpOnly; SameSite=Lax")
        if clear_cookie:
            self.send_header("Set-Cookie", "session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Blog app is running at http://127.0.0.1:{port}")
    print(f"SQLite database: {DB_PATH}")
    print(f"Local JSON backup: {BACKUP_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
