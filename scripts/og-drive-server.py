#!/usr/bin/env python3
"""
OG-BOT drive server  (<drive>:\\OFFLINE AI\\OG-BOT\\og-drive-server.py)

Everything runs from the drive; the website (offline.ogbot.co.uk) is only the front end.
On start this:
  1. scans the hardware: RTX 5080 found -> "ultra" tier (<=14B models fully in VRAM),
     otherwise "handheld" (7-8B models on the Ryzen AI 9 / Radeon 890M),
  2. starts Ollama with settings tuned for that tier, and ComfyUI if it's on the drive,
  3. serves http://127.0.0.1:11500 : /og/status, /ollama/*, /comfy/*  (CORS for the studio),
  4. whenever the internet is available: opens a Cloudflare quick tunnel and registers its
     address with the studio's database, so the website can reach the drive from any device,
  5. once a week when online: refreshes the roster models (only the roster: never >14B).

Requests through the tunnel must carry a signed-in D.EV account's token (checked with
Supabase). Requests from this laptop itself need no token, so it all works offline.
Standard library only (Python 3.8+).
"""
from __future__ import annotations

import ctypes
import http.client
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = "1.1.0"
HERE = os.path.dirname(os.path.abspath(__file__))          # ...\OFFLINE AI\OG-BOT
ROOT = os.path.dirname(HERE)                               # ...\OFFLINE AI
PORT = 11500
OLLAMA_PORT = 11434
COMFY_PORT = 8188
IS_WIN = os.name == "nt"

DEFAULT_CONFIG = {
    "supabase_url": "https://hukxeaewihywbkstkgyf.supabase.co",
    "supabase_key": "sb_publishable_bODYUbyzyXONVaERogULBw_-_6nfdrq",  # public by design
    "drive_key": "",                                                  # from Setup Guide -> Pair drive
    "allowed_emails": ["ogstreamz196@gmail.com", "ogbot196@gmail.com"],
    "remote": True,
    "auto_update_models": True,
}

# The owner's roster. Ultra = RTX 5080 (16 GB): <=14B so every layer stays on CUDA0.
# Coding never downgrades: qwen2.5-coder:14b and deepseek-r1:14b run in both tiers (in RAM when
# portable). Heavy media (ComfyUI) only runs docked.
CORE = ["qwen2.5-coder:14b", "deepseek-r1:14b", "qwen2.5:14b", "mistral-nemo:12b", "dolphin3:8b", "llama3.2:3b"]
ROSTER = {
    "ultra": CORE + ["phi4:14b", "gemma4:12b", "llama3.2-vision:11b"],
    "handheld": CORE + ["qwen2.5-coder:7b", "qwen2.5:7b", "deepseek-r1:8b", "hermes3:8b", "nomic-embed-text:latest"],
}
MAX_PARAMS_B = 14

ALLOWED_ORIGINS = re.compile(
    r"^(https://offline\.ogbot\.co\.uk|https://[a-z0-9-]+\.lovable\.app|http://(localhost|127\.0\.0\.1)(:\d+)?)$"
)

sys.path.insert(0, HERE)
try:
    from og_self_repair import SelfRepair  # OG BOT fixes the app it lives in
except Exception:  # noqa: BLE001
    SelfRepair = None  # type: ignore[assignment,misc]
repair = None  # set in main()

state: dict = {"hardware": {}, "tier": "handheld", "public_url": None, "online": False,
               "registered": False, "last_update": None, "log": []}
_token_cache: dict[str, tuple[str, float]] = {}


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    state["log"] = (state["log"] + [line])[-50:]


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    path = os.path.join(HERE, "og-drive.json")
    try:
        with open(path, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        pass
    except Exception as e:  # noqa: BLE001
        log(f"og-drive.json unreadable ({e}); using defaults")
    return cfg


# ── 1. hardware scan ───────────────────────────────────────────────────────────
def find_exe(*candidates: str) -> str | None:
    for c in candidates:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        w = shutil.which(c)
        if w:
            return w
    return None


def ram_gb() -> float | None:
    try:
        if IS_WIN:
            class MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("a", ctypes.c_ulonglong * 6)]
            m = MS()
            m.dwLength = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))  # type: ignore[attr-defined]
            return round(m.ullTotalPhys / 2**30, 1)
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30, 1)
    except Exception:  # noqa: BLE001
        return None


def parse_nvidia_smi(out: str) -> list[dict]:
    """Rows of `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits`."""
    gpus = []
    for line in out.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 2 and parts[1].replace(".", "").isdigit():
            gpus.append({"name": parts[0], "vram_gb": round(float(parts[1]) / 1024, 1),
                         "driver": parts[2] if len(parts) > 2 else ""})
    return gpus


def choose_tier(gpus: list[dict]) -> str:
    """Ultra when an NVIDIA GPU with ~16 GB+ is present (the RTX 5080 eGPU), else handheld."""
    return "ultra" if any(g["vram_gb"] >= 15 for g in gpus) else "handheld"


def scan_hardware() -> dict:
    smi = find_exe("nvidia-smi", r"C:\Windows\System32\nvidia-smi.exe")
    gpus: list[dict] = []
    if smi:
        try:
            out = subprocess.run([smi, "--query-gpu=name,memory.total,driver_version",
                                  "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=15).stdout
            gpus = parse_nvidia_smi(out)
        except Exception as e:  # noqa: BLE001
            log(f"nvidia-smi failed: {e}")
    tier = choose_tier(gpus)
    best = max(gpus, key=lambda g: g["vram_gb"]) if gpus else None
    hw = {
        "gpu": best["name"] if best else None,
        "vram_gb": best["vram_gb"] if best else 0,
        "rtx5080": bool(best and "5080" in best["name"]),
        "gpus": gpus,
        "cpu": platform.processor() or platform.machine(),
        "ram_gb": ram_gb(),
        "os": platform.platform(),
        "tier": tier,
        "max_params_b": MAX_PARAMS_B,
        "media_render": tier == "ultra",
        "scanned_at": int(time.time()),
    }
    label = f"{hw['gpu']} {hw['vram_gb']} GB" if best else "no NVIDIA GPU (eGPU not connected)"
    log(f"Hardware: {label} · RAM {hw['ram_gb']} GB -> {tier.upper()} tier")
    return hw


# Docked: bind to the RTX 5080 (CUDA:0) and keep AMD ROCm/HIP and Vulkan out of the way.
CUDA_ONLY = {"CUDA_VISIBLE_DEVICES": "0", "HIP_VISIBLE_DEVICES": "-1", "GGML_VK_VISIBLE_DEVICES": "-1"}


def ollama_env(tier: str) -> dict:
    """Ollama settings per tier. Ultra: big context, quantised KV cache, one 14B model at a time."""
    env = {
        "OLLAMA_HOST": f"127.0.0.1:{OLLAMA_PORT}",
        "OLLAMA_ORIGINS": "*",
        "OLLAMA_KEEP_ALIVE": "24h",
        "OLLAMA_NUM_PARALLEL": "1",
        "OLLAMA_MAX_LOADED_MODELS": "1",
    }
    if tier == "ultra":
        env.update({"OLLAMA_FLASH_ATTENTION": "1", "OLLAMA_KV_CACHE_TYPE": "q8_0", "OLLAMA_CONTEXT_LENGTH": "16384"})
        env.update(CUDA_ONLY)
    else:
        # Portable: the same 14B models in the 32 GB RAM (AVX-512 CPU + Radeon 890M via Vulkan).
        env.update({"OLLAMA_CONTEXT_LENGTH": "8192", "OLLAMA_IGPU_ENABLE": "1"})
    models = os.path.join(ROOT, "ollama", "models")
    if os.path.isdir(models):
        env["OLLAMA_MODELS"] = models
    return env


# ── 2. engines ─────────────────────────────────────────────────────────────────
def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def spawn(args: list[str], cwd: str | None, env: dict | None, logname: str) -> subprocess.Popen:
    os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
    out = open(os.path.join(HERE, "logs", logname), "a", encoding="utf-8")  # noqa: SIM115
    flags = 0x08000000 if IS_WIN else 0  # CREATE_NO_WINDOW
    return subprocess.Popen(args, cwd=cwd, env={**os.environ, **(env or {})}, stdout=out,
                            stderr=subprocess.STDOUT, creationflags=flags)


def start_engines(tier: str) -> None:
    if port_open(OLLAMA_PORT):
        log("Ollama already running (restart it to apply the tier settings)")
    else:
        exe = find_exe(os.path.join(ROOT, "ollama", "bin", "ollama.exe"), "ollama")
        if exe:
            spawn([exe, "serve"], None, ollama_env(tier), "ollama.log")
            log(f"Started Ollama ({tier} settings)")
        else:
            log("Ollama not found in OFFLINE AI\\ollama\\bin or PATH")
    if port_open(COMFY_PORT):
        return
    if tier != "ultra":
        log("Portable mode: ComfyUI (heavy video/image rendering) waits for the RTX 5080 dock")
        return
    args = ["--listen", "127.0.0.1", "--port", str(COMFY_PORT), "--enable-cors-header", "*"]
    portable = os.path.join(ROOT, "ComfyUI_windows_portable")
    if os.path.exists(os.path.join(portable, "python_embeded", "python.exe")):
        spawn([os.path.join(portable, "python_embeded", "python.exe"), "-s", os.path.join("ComfyUI", "main.py"),
               "--windows-standalone-build", *args], portable, CUDA_ONLY, "comfyui.log")
        log("Started ComfyUI (portable)")
    elif os.path.exists(os.path.join(ROOT, "ComfyUI", "main.py")):
        spawn([sys.executable, "main.py", *args], os.path.join(ROOT, "ComfyUI"), CUDA_ONLY, "comfyui.log")
        log("Started ComfyUI")


# ── 3. HTTP front door ─────────────────────────────────────────────────────────
def origin_allowed(origin: str | None) -> bool:
    return bool(origin and ALLOWED_ORIGINS.match(origin))


def is_remote(headers) -> bool:
    """Cloudflare adds these to every tunnelled request; local requests never have them."""
    return bool(headers.get("Cf-Connecting-Ip") or headers.get("Cf-Ray"))


def verify_token(token: str, cfg: dict) -> str | None:
    """Return the email for a valid Supabase access token of an allowed D.EV account."""
    now = time.time()
    hit = _token_cache.get(token)
    if hit and hit[1] > now:
        return hit[0]
    req = urllib.request.Request(f"{cfg['supabase_url']}/auth/v1/user",
                                 headers={"apikey": cfg["supabase_key"], "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            email = (json.load(r).get("email") or "").strip().lower()
    except Exception:  # noqa: BLE001
        return None
    if email not in [e.lower() for e in cfg["allowed_emails"]]:
        return None
    _token_cache[token] = (email, now + 300)
    return email


def make_handler(cfg: dict):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = f"OG-BOT-Drive/{VERSION}"

        def log_message(self, fmt, *args):  # quiet
            pass

        def cors(self):
            origin = self.headers.get("Origin")
            if origin_allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Private-Network", "true")

        def reply(self, code: int, body: dict):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def allowed(self) -> bool:
            if not is_remote(self.headers):
                return True
            if not origin_allowed(self.headers.get("Origin")) and self.headers.get("Origin"):
                self.reply(403, {"error": "origin not allowed"})
                return False
            auth = self.headers.get("Authorization", "")
            token = auth[7:] if auth.lower().startswith("bearer ") else ""
            if token and verify_token(token, cfg):
                return True
            self.reply(401, {"error": "sign in with a D.EV account"})
            return False

        def body_json(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 200_000:
                return {}
            try:
                return json.loads(self.rfile.read(n) or b"{}")
            except Exception:  # noqa: BLE001
                return {}

        def route(self):
            path = urlsplit(self.path).path
            if path.startswith("/og/repair") or path == "/og/errors":
                if not self.allowed():
                    return
                if repair is None:
                    self.reply(503, {"error": "self-repair module missing (og_self_repair.py)"})
                elif path == "/og/errors" and self.command == "POST":
                    for e in (self.body_json().get("errors") or [])[:50]:
                        if isinstance(e, dict):
                            repair.report(e)
                    self.reply(200, {"ok": True})
                elif path == "/og/repair" and self.command == "GET":
                    self.reply(200, repair.status())
                elif path == "/og/repair/settings" and self.command == "POST":
                    b = self.body_json()
                    for k in ("auto", "push_main"):
                        if isinstance(b.get(k), bool):
                            repair.settings[k] = b[k]
                    repair.save()
                    self.reply(200, repair.status())
                elif path == "/og/repair/undo" and self.command == "POST":
                    self.reply(200, {"result": repair.undo_last()})
                elif path == "/og/repair/revert" and self.command == "POST":
                    self.reply(200, {"result": repair.revert(str(self.body_json().get("commit", "")) or None)})
                elif path == "/og/repair/diff" and self.command == "GET":
                    from urllib.parse import parse_qs
                    commit = (parse_qs(urlsplit(self.path).query).get("commit") or [""])[0]
                    self.reply(200, {"diff": repair.diff(commit)})
                elif path == "/og/repair/idea" and self.command == "POST":
                    b = self.body_json()
                    text = str(b.get("text", "")).strip()
                    self.reply(200 if text else 400, repair.add_idea(text, str(b.get("view", ""))) if text else {"error": "empty idea"})
                elif path == "/og/repair/hint" and self.command == "POST":
                    b = self.body_json()
                    ok = repair.set_hint(str(b.get("fingerprint", "")), str(b.get("hint", "")))
                    self.reply(200 if ok else 404, repair.status() if ok else {"error": "unknown error"})
                elif path == "/og/repair/retry" and self.command == "POST":
                    fp = str(self.body_json().get("fingerprint", ""))
                    if fp in repair.errors:
                        repair.errors[fp]["status"] = "new"
                        repair.settings["auto"] = True
                        repair.save()
                    self.reply(200, repair.status())
                else:
                    self.reply(404, {"error": "not found"})
                return
            if path == "/og/status":
                if self.command == "GET" and self.allowed():
                    self.reply(200, status_body())
                return
            for prefix, port in (("/ollama", OLLAMA_PORT), ("/comfy", COMFY_PORT)):
                if path == prefix or path.startswith(prefix + "/"):
                    if self.allowed():
                        self.proxy(port, self.path[len(prefix):] or "/")
                    return
            self.reply(404, {"error": "not found"})

        do_GET = do_POST = do_DELETE = route

        def proxy(self, port: int, target: str):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else None
            if port == OLLAMA_PORT and body and self.command == "POST" and target.startswith("/api/pull"):
                try:
                    name = json.loads(body).get("model") or json.loads(body).get("name") or ""
                    if model_too_big(name):
                        self.reply(403, {"error": f"{name} is over the {MAX_PARAMS_B}B limit for 16 GB VRAM"})
                        return
                except Exception:  # noqa: BLE001
                    pass
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=900)
                conn.request(self.command, target, body,
                             {"Content-Type": self.headers.get("Content-Type", "application/json")})
                resp = conn.getresponse()
            except OSError:
                self.reply(502, {"error": "engine not running"})
                return
            self.send_response(resp.status)
            self.cors()
            self.send_header("Content-Type", resp.getheader("Content-Type", "application/octet-stream"))
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                while True:
                    chunk = resp.read1(65536)
                    if not chunk:
                        break
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                conn.close()

    return Handler


def model_too_big(name: str) -> bool:
    m = re.search(r":(\d+(?:\.\d+)?)b\b", name.lower())
    return bool(m and float(m.group(1)) > MAX_PARAMS_B)


def status_body() -> dict:
    return {"ok": True, "version": VERSION, "hardware": state["hardware"], "tier": state["tier"],
            "roster": ROSTER[state["tier"]],
            "services": {"ollama": port_open(OLLAMA_PORT), "comfyui": port_open(COMFY_PORT)},
            "online": state["online"], "public_url": state["public_url"], "registered": state["registered"],
            "last_model_update": state["last_update"], "log": state["log"][-15:],
            "self_repair": repair.readiness() if repair else None}


# ── 4. going online: tunnel + registration ─────────────────────────────────────
def internet(cfg: dict) -> bool:
    try:
        urllib.request.urlopen(f"{cfg['supabase_url']}/auth/v1/health", timeout=5)
        return True
    except urllib.error.HTTPError:
        return True  # reachable, just not 200
    except Exception:  # noqa: BLE001
        return False


def register(cfg: dict) -> None:
    if not cfg.get("drive_key") or not state["public_url"]:
        if not cfg.get("drive_key"):
            log("Not paired yet: Setup Guide -> Drive kit -> Pair this drive (remote access stays off)")
        return
    body = json.dumps({"p_key": cfg["drive_key"], "p_url": state["public_url"], "p_hardware": state["hardware"]}).encode()
    req = urllib.request.Request(f"{cfg['supabase_url']}/rest/v1/rpc/register_drive", data=body, method="POST",
                                 headers={"apikey": cfg["supabase_key"], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            ok = json.load(r) is True
        state["registered"] = ok
        log("Remote access ON: the studio can reach this drive from any device" if ok else "Pairing key rejected: pair the drive again")
    except Exception as e:  # noqa: BLE001
        log(f"Registration failed: {e}")


TUNNEL_URL = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


CLOUDFLARED_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"


def ensure_cloudflared() -> str | None:
    """Use cloudflared from the drive; when online and missing, fetch the official build once."""
    target = os.path.join(ROOT, "cloudflared", "cloudflared.exe")
    exe = find_exe(target, os.path.join(HERE, "cloudflared.exe"), "cloudflared")
    if exe or not IS_WIN:
        return exe
    try:
        log("Downloading cloudflared (official Cloudflare release, one time)...")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        tmp = target + ".part"
        urllib.request.urlretrieve(CLOUDFLARED_URL, tmp)
        os.replace(tmp, target)
        return target
    except Exception as e:  # noqa: BLE001
        log(f"Couldn't download cloudflared: {e}")
        return None


def run_tunnel(cfg: dict) -> subprocess.Popen | None:
    if not cfg.get("drive_key"):
        register(cfg)  # logs the "pair this drive" hint
        return None
    exe = ensure_cloudflared()
    if not exe:
        log("cloudflared not available: remote access off (local use still works)")
        return None
    p = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         creationflags=0x08000000 if IS_WIN else 0)

    def reader():
        for line in p.stdout:  # type: ignore[union-attr]
            m = TUNNEL_URL.search(line)
            if m and m.group(0) != state["public_url"]:
                state["public_url"] = m.group(0)
                log(f"Tunnel up: {state['public_url']}")
                register(cfg)
    threading.Thread(target=reader, daemon=True).start()
    return p


def update_models() -> None:
    """Weekly, when online: re-pull installed roster models (only changed layers download)."""
    marker = os.path.join(HERE, "logs", "last-model-update")
    try:
        if time.time() - os.path.getmtime(marker) < 7 * 86400:
            state["last_update"] = int(os.path.getmtime(marker))
            return
    except OSError:
        pass
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{OLLAMA_PORT}/api/tags", timeout=10) as r:
            installed = {m["name"] for m in json.load(r).get("models", [])}
    except Exception:  # noqa: BLE001
        return
    norm = lambda t: t if ":" in t else f"{t}:latest"  # noqa: E731
    todo = [m for m in dict.fromkeys(ROSTER["ultra"] + ROSTER["handheld"]) if norm(m) in {norm(i) for i in installed} and not model_too_big(m)]
    log(f"Weekly model refresh: {len(todo)} roster models")
    for m in todo:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{OLLAMA_PORT}/api/pull", method="POST",
                                         data=json.dumps({"model": m, "stream": False}).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=3600).read()
        except Exception as e:  # noqa: BLE001
            log(f"Refresh of {m} failed: {e}")
            return
    os.makedirs(os.path.dirname(marker), exist_ok=True)
    open(marker, "w").close()  # noqa: SIM115
    state["last_update"] = int(time.time())
    log("Model refresh done")


def online_loop(cfg: dict) -> None:
    tunnel: subprocess.Popen | None = None
    updated = False
    while True:
        up = internet(cfg)
        if up != state["online"]:
            log("Internet available" if up else "Offline: everything keeps working locally")
        state["online"] = up
        if up and cfg.get("remote", True) and (tunnel is None or tunnel.poll() is not None):
            state["public_url"], state["registered"] = None, False
            tunnel = run_tunnel(cfg)
        if up and cfg.get("auto_update_models", True) and not updated and port_open(OLLAMA_PORT):
            updated = True
            threading.Thread(target=update_models, daemon=True).start()
        time.sleep(30)


def repair_loop() -> None:
    while True:
        time.sleep(60)
        if repair and port_open(OLLAMA_PORT):
            try:
                repair.tick()
            except Exception as e:  # noqa: BLE001
                log(f"Self-repair error: {e}")


def main() -> None:
    global repair
    cfg = load_config()
    if SelfRepair:
        repair = SelfRepair(HERE, ROOT, cfg, log)
        threading.Thread(target=repair_loop, daemon=True).start()
    log(f"OG-BOT drive server {VERSION} · {ROOT}")
    state["hardware"] = scan_hardware()
    state["tier"] = state["hardware"]["tier"]
    start_engines(state["tier"])
    threading.Thread(target=online_loop, args=(cfg,), daemon=True).start()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), make_handler(cfg))
    except OSError:
        log(f"Port {PORT} busy: the drive server is probably already running")
        return
    log(f"Studio link: http://127.0.0.1:{PORT}/og/status")
    server.serve_forever()


if __name__ == "__main__":
    main()
