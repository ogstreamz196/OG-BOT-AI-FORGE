"""
OG BOT self-repair: the studio's own coding model fixes the app it lives in.

Runs inside og-drive-server.py on the drive. For each error the website reports:
  1. update the drive's own clone of the app's source (OFFLINE AI\\OG-BOT\\forge-src),
  2. pick the source files related to the error,
  3. deepseek-r1:14b plans the fix, qwen2.5-coder:14b writes it (full files),
  4. guardrails: only src/ files, no generated/protected files, limited size,
  5. run the app's own checks (TypeScript + the test suite) with Bun on the drive;
     on failure OG BOT gets one retry with the check output,
  6. commit as "OG BOT"; push to an ogbot/autofix-* branch, and to main (which Lovable
     syncs) only when every check passed and auto-push is on. Every attempt is logged;
     the last autofix can be undone (git revert) from the Dashboard.

Standard library only. Pure helpers are unit-tested in test_og_drive_server.py.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.request

MEMORY_FILE = "docs/OGBOT_MEMORY.md"
ALLOWED_PREFIX = "src/"
PROTECTED = re.compile(
    r"(^|/)(routeTree\.gen\.ts|components/ui/|integrations/)|^src/(server|start|router)\.ts$|\.gen\.|^src/test/setup\.ts$"
)
MAX_CHANGED_LINES = 300
MAX_CONTEXT_CHARS = 36_000
PLANNER = "deepseek-r1:14b"
CODER = "qwen2.5-coder:14b"

# Which source file holds each tab/view the website reports in its breadcrumbs.
VIEW_FILES = {
    "create": "src/components/studio/Create.tsx", "build": "src/components/studio/Chat.tsx",
    "preview": "src/components/studio/Preview.tsx", "dev": "src/components/studio/DevWorkbench.tsx",
    "musicvideo": "src/components/studio/MusicVideo.tsx", "image": "src/components/studio/ImageGen.tsx",
    "music": "src/components/studio/Music.tsx", "settings": "src/components/studio/Settings.tsx",
    "dash": "src/components/studio/Dashboard.tsx", "setup": "src/components/studio/SetupGuide.tsx",
    "ollama": "src/components/studio/OllamaTester.tsx", "hardware": "src/components/studio/Hardware.tsx",
    "sentinel": "src/components/studio/Sentinel.tsx", "connectors": "src/components/studio/Connectors.tsx",
}

FALLBACK_MEMORY = """You are OG BOT, the coding model inside OGSTREAMZ presentz OFFLINE FORGE (offline.ogbot.co.uk).
You are fixing a bug in the web app you live in. React 19 + TypeScript + TanStack Start + Tailwind.
Make the smallest correct change. Keep every existing feature, test and the "Powered by OG BOT" badge.
Never hardcode drive letters. Never pick models above 14B. Output full files only."""


# ── pure helpers (tested) ──────────────────────────────────────────────────────
def strip_think(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text or "").strip()


def parse_files(text: str) -> list[tuple[str, str]]:
    """Files from '### `path`' + fenced block answers (same format as the Dev Workbench)."""
    out: list[tuple[str, str]] = []
    for m in re.finditer(r"```([^\n`]*)\n([\s\S]*?)```", strip_think(text)):
        before = strip_think(text)[: m.start()].rstrip().splitlines()
        heading = before[-1] if before else ""
        info = m.group(1).strip().split()
        name = None
        hm = re.search(r"`([^`\s]+\.[A-Za-z0-9]+)`", heading) or re.search(r"(?:file|path)\s*:\s*([^\s`*]+\.[A-Za-z0-9]+)", heading, re.I)
        if hm:
            name = hm.group(1)
        elif len(info) > 1 and "." in info[1]:
            name = info[1]
        if name:
            out.append((name.lstrip("./"), m.group(2).rstrip("\n") + "\n"))
    return out


def allowed_path(path: str) -> bool:
    p = path.replace("\\", "/")
    return p.startswith(ALLOWED_PREFIX) and ".." not in p and not PROTECTED.search(p) and p.endswith((".ts", ".tsx", ".css"))


def changed_lines(old: str, new: str) -> int:
    a, b = old.splitlines(), new.splitlines()
    sa, sb = set(a), set(b)
    return sum(1 for line in b if line not in sa) + sum(1 for line in a if line not in sb)


def search_terms(error: dict) -> list[str]:
    """Distinctive words from the error to grep the source for."""
    msg = f"{error.get('message', '')} {json.dumps(error.get('detail', {}).get('extra', {}))}"
    quoted = re.findall(r"[\"'`]([A-Za-z][\w .:-]{3,40})[\"'`]", msg)
    idents = re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+|[a-z]+[A-Z][A-Za-z0-9]+)\b", msg)
    seen, terms = set(), []
    for t in quoted + idents:
        t = t.strip()
        if len(t) >= 4 and t.lower() not in seen:
            seen.add(t.lower())
            terms.append(t)
    return terms[:8]


def pick_files(repo: str, error: dict, limit: int = 4) -> list[str]:
    """Files to show the model: the screen the error happened on, then files containing its words."""
    picks: list[str] = []
    ctx = error.get("detail", {}).get("context", {})
    words = re.findall(r"[a-z]+", str(error.get("message", "")).lower()) if error.get("kind") == "idea" else []
    named = [w for w in words if w in VIEW_FILES] + (["dash"] if "dashboard" in words else []) + (["build"] if "builder" in words else [])
    for v in [*named, ctx.get("view"), ctx.get("tool"), *[c.get("view") for c in ctx.get("breadcrumbs", [])[-3:] if isinstance(c, dict)]]:
        f = VIEW_FILES.get(str(v or "").lower())
        if f and f not in picks and os.path.exists(os.path.join(repo, f)):
            picks.append(f)
    src = os.path.join(repo, "src")
    for term in search_terms(error):
        for root, _dirs, names in os.walk(src):
            if "/test" in root.replace("\\", "/") or "components/ui" in root.replace("\\", "/"):
                continue
            for n in names:
                if not n.endswith((".ts", ".tsx")):
                    continue
                full = os.path.join(root, n)
                rel = os.path.relpath(full, repo).replace("\\", "/")
                if rel in picks:
                    continue
                try:
                    if term in open(full, encoding="utf-8").read():
                        picks.append(rel)
                except OSError:
                    pass
                if len(picks) >= limit:
                    return picks[:limit]
    if not picks and error.get("kind") == "idea" and os.path.exists(os.path.join(repo, "src/routes/index.tsx")):
        picks.append("src/routes/index.tsx")  # an idea with no screen named starts from the studio shell
    return picks[:limit]


def build_prompt(memory: str, error: dict, files: dict[str, str], plan: str = "", check_output: str = "") -> str:
    is_idea = error.get("kind") == "idea"
    parts = (
        ["## The owner's request (implement this)", str(error.get("message", ""))]
        if is_idea
        else [
            "## The error (reported by the live website)",
            f"kind: {error.get('kind')}\nmessage: {error.get('message')}\nseen: {error.get('count', 1)} time(s)",
            "```json\n" + json.dumps(error.get("detail", {}), indent=1)[:6000] + "\n```",
        ]
    )
    if error.get("hint"):
        parts += ["## The owner's idea for this (follow it)", str(error["hint"])[:2000]]
    if plan:
        parts += ["## Plan from the reasoning model", plan[:4000]]
    if check_output:
        parts += ["## Your previous fix failed the checks — fix these errors", "```\n" + check_output[-4000:] + "\n```"]
    parts.append("## Current source files")
    budget = MAX_CONTEXT_CHARS
    for path, content in files.items():
        chunk = f"### `{path}`\n```tsx\n{content}\n```"
        if len(chunk) > budget:
            break
        budget -= len(chunk)
        parts.append(chunk)
    parts.append(
        ("## Task\nMake the owner's request with the smallest clean change." if is_idea else
         "## Task\nFix the root cause with the smallest correct change.")
        + " Output ONLY the files you change, each in full:\n"
        "### `src/path/File.tsx`\n```tsx\n...entire file...\n```\nThen one line starting with SUMMARY: describing the change.\n"
        "If no code change can fix it (missing model files, hardware, network, the owner's setup), output only one line:\n"
        "NO_CODE_CHANGE: <what the owner should do>"
    )
    return "\n\n".join(parts)


# ── side effects ───────────────────────────────────────────────────────────────
def _run(args: list[str], cwd: str, timeout: int = 900) -> tuple[int, str]:
    try:
        p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           creationflags=0x08000000 if os.name == "nt" else 0)
        return p.returncode, (p.stdout + p.stderr)[-8000:]
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


OLLAMA_CHAT = "http://127.0.0.1:11434/api/chat"


def _chat(model: str, prompt: str, system: str, ctx: int = 16384) -> str:
    body = json.dumps({"model": model, "stream": False, "keep_alive": "24h", "options": {"temperature": 0.2, "num_ctx": ctx},
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(OLLAMA_CHAT, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        return json.load(r).get("message", {}).get("content", "")


class SelfRepair:
    def __init__(self, here: str, root: str, cfg: dict, log):
        self.here, self.root, self.cfg, self.log = here, root, cfg, log
        self.repo = os.path.join(here, "forge-src")
        self.state_file = os.path.join(here, "logs", "self-repair.json")
        self.errors: dict[str, dict] = {}
        self.repairs: list[dict] = []
        self.settings = {"auto": True, "push_main": True}
        self.busy = False
        try:
            saved = json.load(open(self.state_file, encoding="utf-8"))
            self.errors, self.repairs = saved.get("errors", {}), saved.get("repairs", [])
            self.settings.update(saved.get("settings", {}))
        except Exception:  # noqa: BLE001
            pass

    def save(self):
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        json.dump({"errors": self.errors, "repairs": self.repairs[-50:], "settings": self.settings},
                  open(self.state_file, "w", encoding="utf-8"))

    # tools on the drive
    def git(self) -> str | None:
        return next((p for p in [os.path.join(self.root, "git", "cmd", "git.exe"), os.path.join(self.root, "PortableGit", "cmd", "git.exe"), shutil.which("git")] if p and os.path.exists(p)), None)

    def bun(self) -> str | None:
        return next((p for p in [os.path.join(self.root, "bun", "bun.exe"), shutil.which("bun")] if p and os.path.exists(p)), None)

    def _download_zip(self, url: str, dest: str, want: str) -> str | None:
        """Fetch an official release zip and unpack it into OFFLINE AI/<dest> (one time)."""
        import io
        import zipfile
        try:
            self.log(f"Downloading {want} for self-repair (one time)...")
            data = urllib.request.urlopen(url, timeout=600).read()
            target = os.path.join(self.root, dest)
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                z.extractall(target)
            for r, _d, names in os.walk(target):
                if want in names:
                    return os.path.join(r, want)
        except Exception as e:  # noqa: BLE001
            self.log(f"Couldn't download {want}: {e}")
        return None

    def ensure_tools(self) -> None:
        """When online on Windows, fetch Bun and Git (MinGit) if the drive doesn't have them."""
        if os.name != "nt":
            return
        if not self.bun():
            self._download_zip("https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip", "bun", "bun.exe")
            for r, _d, names in os.walk(os.path.join(self.root, "bun")):
                if "bun.exe" in names and r != os.path.join(self.root, "bun"):
                    shutil.copy2(os.path.join(r, "bun.exe"), os.path.join(self.root, "bun", "bun.exe"))
        if not self.git():
            try:
                rel = json.load(urllib.request.urlopen("https://api.github.com/repos/git-for-windows/git/releases/latest", timeout=30))
                asset = next(a for a in rel["assets"] if re.match(r"MinGit-[\d.]+-64-bit\.zip$", a["name"]))
                self._download_zip(asset["browser_download_url"], "git", "git.exe")
            except Exception as e:  # noqa: BLE001
                self.log(f"Couldn't fetch Git: {e}")

    def readiness(self) -> dict:
        return {"git": bool(self.git()), "bun": bool(self.bun()), "token": bool(self.cfg.get("github_token")),
                "repo": self.cfg.get("repo", "ogstreamz196/OG-BOT-AI-FORGE"), "clone": os.path.isdir(os.path.join(self.repo, ".git"))}

    def remote_url(self) -> str:
        if self.cfg.get("remote_url"):  # tests use a local repo
            return self.cfg["remote_url"]
        return f"https://x-access-token:{self.cfg.get('github_token', '')}@github.com/{self.cfg.get('repo', 'ogstreamz196/OG-BOT-AI-FORGE')}.git"

    # reports from the website
    def report(self, e: dict) -> None:
        fp = str(e.get("fingerprint", ""))[:128]
        if not fp:
            return
        cur = self.errors.get(fp)
        if cur:
            cur["count"] = cur.get("count", 1) + 1
            cur["last_seen"] = int(time.time())
            cur["detail"] = e.get("detail", cur.get("detail"))
            if cur.get("status") == "fixed" and e.get("build") and e.get("build") != cur.get("fixed_build"):
                cur["status"] = "new"  # came back on a newer build: try again
        else:
            self.errors[fp] = {"fingerprint": fp, "kind": e.get("kind"), "message": str(e.get("message", ""))[:1000],
                               "detail": e.get("detail", {}), "count": 1, "status": "new" if e.get("kind") != "healed" else "auto_fixed",
                               "first_seen": int(time.time()), "last_seen": int(time.time()), "build": e.get("build")}
        self.save()

    # one repair attempt
    def ensure_clone(self) -> str | None:
        if not self.cfg.get("github_token") and not self.cfg.get("remote_url"):
            return "needs a GitHub token: Setup Guide -> Remote access -> self-repair key, then re-download og-drive.json"
        self.ensure_tools()
        g = self.git()
        if not g:
            return "needs Git on the drive (OFFLINE AI\\git) - couldn't download it"
        if not os.path.isdir(os.path.join(self.repo, ".git")):
            code, out = _run([g, "clone", "--depth", "50", self.remote_url(), self.repo], self.here)
            if code:
                return f"clone failed: {out[-300:]}"
        _run([g, "remote", "set-url", "origin", self.remote_url()], self.repo)
        code, out = _run([g, "fetch", "origin", "main"], self.repo)
        if code:
            return f"fetch failed: {out[-300:]}"
        _run([g, "checkout", "-B", "ogbot-work", "origin/main"], self.repo)
        _run([g, "reset", "--hard", "origin/main"], self.repo)
        _run([g, "clean", "-fd"], self.repo)
        return None

    def checks(self) -> tuple[bool, str]:
        b = self.bun()
        if not b:
            return False, "bun not found on the drive (OFFLINE AI\\bun\\bun.exe)"
        code, out = _run([b, "install", "--frozen-lockfile"], self.repo, 1800)
        if code:
            return False, "bun install failed:\n" + out
        code, tsc = _run([b, "x", "tsc", "--noEmit", "-p", "."], self.repo)
        if code:
            return False, "TypeScript errors:\n" + tsc
        code, test = _run([b, "run", "test"], self.repo, 1800)
        return code == 0, ("tests failed:\n" if code else "") + test

    def attempt(self, err: dict) -> dict:
        rec = {"fingerprint": err["fingerprint"], "message": err["message"], "started": int(time.time()), "steps": []}
        step = lambda s: (rec["steps"].append(s), self.log(f"Self-repair: {s}"))  # noqa: E731
        problem = self.ensure_clone()
        if problem:
            rec.update(status="blocked", reason=problem)
            return rec
        memory_path = os.path.join(self.repo, MEMORY_FILE)
        memory = open(memory_path, encoding="utf-8").read() if os.path.exists(memory_path) else FALLBACK_MEMORY
        files = {p: open(os.path.join(self.repo, p), encoding="utf-8").read() for p in pick_files(self.repo, err)}
        step(f"looking at {', '.join(files) or 'no matching files'}")
        if not files:
            rec.update(status="needs_owner", reason="couldn't find the code for this error")
            return rec
        try:
            plan = strip_think(_chat(PLANNER, build_prompt(memory, err, files) + "\n\nFirst, explain the root cause and the fix in under 12 lines. No code.", memory))
            step("plan written by " + PLANNER)
        except Exception as e:  # noqa: BLE001
            plan = ""
            step(f"planner unavailable ({e}); coding directly")
        check_out, summary = "", ""
        for attempt_no in (1, 2):
            answer = _chat(CODER, build_prompt(memory, err, files, plan, check_out), memory)
            no_code = next((l.split(":", 1)[1].strip() for l in strip_think(answer).splitlines() if l.startswith("NO_CODE_CHANGE")), None)
            if no_code:
                rec.update(status="needs_owner", reason=no_code)
                step("OG BOT says this needs you, not code: " + no_code)
                return rec
            summary = next((l[8:].strip() for l in answer.splitlines() if l.startswith("SUMMARY:")), "")
            edits = [(p, c) for p, c in parse_files(answer) if allowed_path(p)]
            if not edits:
                rec.update(status="failed", reason="OG BOT didn't return any allowed file changes")
                return rec
            total = sum(changed_lines(files.get(p, ""), c) for p, c in edits)
            if total > MAX_CHANGED_LINES:
                rec.update(status="failed", reason=f"change too big ({total} lines)")
                return rec
            for p, c in edits:
                with open(os.path.join(self.repo, p), "w", encoding="utf-8", newline="\n") as f:
                    f.write(c)
            step(f"attempt {attempt_no}: changed {', '.join(p for p, _ in edits)} ({total} lines)")
            ok, check_out = self.checks()
            step("checks passed" if ok else "checks failed")
            if ok:
                break
            _run([self.git(), "checkout", "--", "."], self.repo)
            _run([self.git(), "clean", "-fd", "src"], self.repo)
            files.update({p: open(os.path.join(self.repo, p), encoding="utf-8").read() for p, _ in edits if os.path.exists(os.path.join(self.repo, p))})
        rec["check_tail"] = check_out[-1500:]
        if not ok:
            rec.update(status="failed", reason="fix didn't pass the checks after 2 tries")
            return rec
        g = self.git()
        _run([g, "-c", "user.name=OG BOT", "-c", "user.email=ogbot@ogbot.co.uk", "commit", "-am",
              f"OG BOT {'idea' if err.get('kind') == 'idea' else 'autofix'}: {err['message'][:60]}\n\n{summary}\n\nFingerprint: {err['fingerprint']}"], self.repo)
        sha = _run([g, "rev-parse", "--short", "HEAD"], self.repo)[1].strip()
        branch = f"ogbot/autofix-{err['fingerprint'][:8]}"
        _run([g, "push", "-f", "origin", f"HEAD:refs/heads/{branch}"], self.repo)
        rec.update(commit=sha, branch=branch, summary=summary)
        if self.settings.get("push_main"):
            code, out = _run([g, "push", "origin", "HEAD:main"], self.repo)
            rec.update(status="fixed" if code == 0 else "pushed_branch", reason=None if code == 0 else f"main moved on: {out[-200:]}")
            step("pushed to main: Lovable syncs it, then press Publish (or it's live on the next publish)" if code == 0 else "pushed to branch only")
        else:
            rec.update(status="pushed_branch")
        return rec

    def tick(self) -> None:
        """Called every minute by the server: repair the oldest new error, one at a time."""
        if self.busy or not self.settings.get("auto"):
            return
        todo = sorted((e for e in self.errors.values() if e.get("status") == "new"), key=lambda e: e.get("first_seen", 0))
        if not todo:
            return
        self.busy = True
        err = todo[0]
        err["status"] = "fixing"
        self.save()
        try:
            rec = self.attempt(err)
        except Exception as e:  # noqa: BLE001
            rec = {"fingerprint": err["fingerprint"], "message": err["message"], "status": "failed", "reason": str(e)}
        rec["finished"] = int(time.time())
        err["status"] = {"fixed": "fixed", "pushed_branch": "fixed"}.get(rec.get("status", ""), rec.get("status", "failed"))
        if err["status"] == "fixed":
            err["fixed_build"] = err.get("build")
        if rec.get("status") == "blocked":
            err["status"] = "new"  # try again once the drive has git/bun/token
            self.settings["auto"] = False  # don't spin; turned back on from the Dashboard
        err["last_repair"] = rec
        self.repairs.append(rec)
        self.busy = False
        self.save()

    def history(self, limit: int = 25) -> dict:
        """Recent commits on main (anyone's: OG BOT, Lovable, Claude, the owner), newest first."""
        g = self.git()
        if self.busy:
            return {"commits": [], "error": "OG BOT is busy fixing something; try again in a minute"}
        problem = self.ensure_clone() if g else "Git isn't on the drive yet"
        if problem:
            return {"commits": [], "error": problem}
        code, out = _run([g, "log", f"-{int(limit)}", "--no-merges", "--format=%H%x1f%h%x1f%an%x1f%ct%x1f%s", "origin/main"], self.repo, 60)
        commits = []
        for line in out.splitlines() if code == 0 else []:
            p = line.split("\x1f")
            if len(p) == 5:
                commits.append({"sha": p[0], "short": p[1], "author": p[2], "time": int(p[3]), "subject": p[4]})
        undone = {r.get("commit") for r in self.repairs if r.get("status") == "undone"}
        for c in commits:
            c["reverted"] = c["short"] in undone
        return {"commits": commits, "repo": self.cfg.get("repo", "")}

    def revert(self, commit: str | None = None) -> str:
        """Undo a change on main and publish the undo: one of OG BOT's fixes (the latest when no
        commit is given), or any recent commit the owner picks from the change history."""
        if self.busy:
            return "OG BOT is busy fixing something; try again in a minute"
        rec = next((r for r in reversed(self.repairs) if r.get("commit") and r.get("status") == "fixed" and (not commit or r["commit"] == commit)), None)
        g = self.git()
        if not g or self.ensure_clone():
            return "nothing to undo"
        if commit and any(r.get("status") == "undone" and r.get("commit") and commit.startswith(r["commit"]) for r in self.repairs):
            return "already undone"
        if rec:
            target = rec["commit"]
        elif commit and re.fullmatch(r"[0-9a-f]{6,40}", commit) and _run([g, "merge-base", "--is-ancestor", commit, "HEAD"], self.repo)[0] == 0:
            target = commit
        else:
            return "nothing to undo"
        code, out = _run([g, "-c", "user.name=OG BOT", "-c", "user.email=ogbot@ogbot.co.uk", "revert", "--no-edit", target], self.repo)
        if code:
            _run([g, "revert", "--abort"], self.repo)
            return f"revert failed (a later change touched the same lines): {out[-200:]}"
        code, out = _run([g, "push", "origin", "HEAD:main"], self.repo)
        if not rec:
            self.repairs.append({"commit": target[:12], "status": "undone", "message": "owner reverted " + target[:7], "finished": int(time.time())})
            self.save()
            return "reverted and pushed" if code == 0 else f"push failed: {out[-200:]}"
        rec["status"] = "undone"
        err = self.errors.get(rec.get("fingerprint", ""))
        if err:
            err["status"] = "reverted"
            if isinstance(err.get("last_repair"), dict) and err["last_repair"].get("commit") == rec["commit"]:
                err["last_repair"]["status"] = "undone"
        self.save()
        return "reverted and pushed" if code == 0 else f"push failed: {out[-200:]}"

    def undo_last(self) -> str:
        return self.revert()

    def diff(self, commit: str) -> str:
        """What a fix changed (for review in the Dashboard)."""
        g = self.git()
        if not g or not re.fullmatch(r"[0-9a-f]{6,40}", commit or "") or not os.path.isdir(os.path.join(self.repo, ".git")):
            return "not available"
        code, out = _run([g, "show", "--stat", "--patch", "--format=%s%n", commit], self.repo, 60)
        return out[:20000] if code == 0 else "not available (the drive's copy doesn't have that commit yet)"

    def add_idea(self, text: str, view: str = "") -> dict:
        """The owner's own idea as a task for OG BOT, worked like an error."""
        text = text.strip()[:2000]
        fp = "idea-" + format(abs(hash((text, time.time()))) % (1 << 40), "x")
        self.errors[fp] = {"fingerprint": fp, "kind": "idea", "message": text, "detail": {"context": {"view": view}},
                           "count": 1, "status": "new", "first_seen": int(time.time()), "last_seen": int(time.time())}
        self.settings["auto"] = True
        self.save()
        return self.errors[fp]

    def set_hint(self, fingerprint: str, hint: str) -> bool:
        """Add the owner's idea to an error and let OG BOT try again with it."""
        err = self.errors.get(fingerprint)
        if not err:
            return False
        err["hint"] = hint.strip()[:2000]
        err["status"] = "new"
        self.settings["auto"] = True
        self.save()
        return True

    def status(self) -> dict:
        return {"settings": self.settings, "ready": self.readiness(), "busy": self.busy,
                "errors": sorted(self.errors.values(), key=lambda e: -e.get("last_seen", 0))[:50],
                "repairs": list(reversed(self.repairs[-20:]))}
