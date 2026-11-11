"""Self-test for og-drive-server.py:  python test_og_drive_server.py"""
import importlib.util, os, shutil, unittest

spec = importlib.util.spec_from_file_location("ogds", os.path.join(os.path.dirname(__file__), "og-drive-server.py"))
ogds = importlib.util.module_from_spec(spec); spec.loader.exec_module(ogds)


class T(unittest.TestCase):
    def test_rtx5080_means_ultra(self):
        gpus = ogds.parse_nvidia_smi("NVIDIA GeForce RTX 5080, 16303, 581.57\n")
        self.assertEqual(gpus[0]["name"], "NVIDIA GeForce RTX 5080")
        self.assertEqual(gpus[0]["vram_gb"], 15.9)
        self.assertEqual(ogds.choose_tier(gpus), "ultra")

    def test_no_egpu_means_handheld(self):
        self.assertEqual(ogds.choose_tier([]), "handheld")
        self.assertEqual(ogds.choose_tier(ogds.parse_nvidia_smi("NVIDIA GeForce RTX 4060 Laptop GPU, 8188, 560\n")), "handheld")

    def test_tier_settings(self):
        u, h = ogds.ollama_env("ultra"), ogds.ollama_env("handheld")
        self.assertEqual(u["OLLAMA_CONTEXT_LENGTH"], "16384"); self.assertEqual(u["OLLAMA_FLASH_ATTENTION"], "1")
        self.assertEqual(u["OLLAMA_MAX_LOADED_MODELS"], "1"); self.assertEqual(u["OLLAMA_HOST"], "127.0.0.1:11434")
        self.assertEqual(u["OLLAMA_KEEP_ALIVE"], "24h"); self.assertEqual(u["OLLAMA_ORIGINS"], "*")
        self.assertEqual((u["CUDA_VISIBLE_DEVICES"], u["HIP_VISIBLE_DEVICES"], u["GGML_VK_VISIBLE_DEVICES"]), ("0", "-1", "-1"))
        self.assertNotIn("HIP_VISIBLE_DEVICES", h)  # portable mode keeps the Radeon 890M available
        self.assertEqual(h["OLLAMA_CONTEXT_LENGTH"], "8192"); self.assertEqual(h["OLLAMA_IGPU_ENABLE"], "1")

    def test_coder_never_downgrades(self):
        for tier in ("ultra", "handheld"):
            self.assertIn("qwen2.5-coder:14b", ogds.ROSTER[tier])
            self.assertIn("deepseek-r1:14b", ogds.ROSTER[tier])

    def test_14b_ceiling(self):
        self.assertFalse(ogds.model_too_big("qwen2.5-coder:14b"))
        self.assertTrue(ogds.model_too_big("qwen2.5-coder:32b"))
        self.assertTrue(ogds.model_too_big("llama3.3:70b"))
        self.assertFalse(ogds.model_too_big("nomic-embed-text:latest"))
        for m in ogds.ROSTER["ultra"] + ogds.ROSTER["handheld"]:
            self.assertFalse(ogds.model_too_big(m), m)

    def test_no_hardcoded_drive_letters(self):
        src = open(os.path.join(os.path.dirname(__file__), "og-drive-server.py"), encoding="utf-8").read()
        self.assertNotRegex(src, r'["\'][A-Za-z]:\\\\(?!Windows)')  # only C:\Windows\System32 for nvidia-smi

    def test_origins(self):
        for o in ["https://offline.ogbot.co.uk", "https://ogcloud.lovable.app", "http://localhost:8080", "http://127.0.0.1"]:
            self.assertTrue(ogds.origin_allowed(o), o)
        for o in ["https://evil.example", "https://offline.ogbot.co.uk.evil.com", None]:
            self.assertFalse(ogds.origin_allowed(o), o)

    def test_tunnel_url(self):
        line = "2026-11-10 INF |  https://brave-neon-cat.trycloudflare.com  |"
        self.assertEqual(ogds.TUNNEL_URL.search(line).group(0), "https://brave-neon-cat.trycloudflare.com")



rspec = importlib.util.spec_from_file_location("osr", os.path.join(os.path.dirname(__file__), "og_self_repair.py"))
osr = importlib.util.module_from_spec(rspec); rspec.loader.exec_module(osr)


class SelfRepairTests(unittest.TestCase):
    def test_parse_full_files(self):
        ans = "<think>hmm</think>Fix:\n### `src/lib/creation.ts`\n```ts\nexport const a = 1\n```\nSUMMARY: fixed"
        self.assertEqual(osr.parse_files(ans), [("src/lib/creation.ts", "export const a = 1\n")])

    def test_guardrails(self):
        self.assertTrue(osr.allowed_path("src/components/studio/Create.tsx"))
        for bad in ["src/routeTree.gen.ts", "src/components/ui/button.tsx", "src/integrations/x.ts", "AGENTS.md",
                    "supabase/migrations/x.sql", ".github/workflows/deploy.yml", "src/../scripts/x.py", "scripts/og-drive-server.py",
                    "src/server.ts", "src/test/setup.ts"]:
            self.assertFalse(osr.allowed_path(bad), bad)

    def test_changed_lines(self):
        self.assertEqual(osr.changed_lines("a\nb\nc", "a\nB\nc"), 2)

    def test_search_terms_and_file_picking(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "src/components/studio"))
            open(os.path.join(d, "src/components/studio/Create.tsx"), "w").write("export function Create(){}")
            open(os.path.join(d, "src/components/studio/Other.tsx"), "w").write("const x = classifyCreation('a')")
            err = {"message": "TypeError: classifyCreation is not a function", "detail": {"context": {"view": "create"}}}
            self.assertIn("classifyCreation", osr.search_terms(err))
            self.assertEqual(osr.pick_files(d, err), ["src/components/studio/Create.tsx", "src/components/studio/Other.tsx"])

    def test_prompt_contains_error_files_and_retry_output(self):
        p = osr.build_prompt("MEM", {"kind": "crash", "message": "boom", "detail": {}}, {"src/a.ts": "x"}, "plan", "TS2345")
        for part in ["boom", "### `src/a.ts`", "plan", "TS2345", "SUMMARY:"]:
            self.assertIn(part, p)

    def test_reports_group_and_reopen_on_new_build(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            r = osr.SelfRepair(d, d, {}, lambda m: None)
            r.report({"fingerprint": "f1", "kind": "crash", "message": "boom", "build": "b1"})
            r.report({"fingerprint": "f1", "kind": "crash", "message": "boom", "build": "b1"})
            self.assertEqual(r.errors["f1"]["count"], 2)
            r.errors["f1"].update(status="fixed", fixed_build="b1")
            r.report({"fingerprint": "f1", "kind": "crash", "message": "boom", "build": "b2"})
            self.assertEqual(r.errors["f1"]["status"], "new")
            r.report({"fingerprint": "h1", "kind": "healed", "message": "reconnected"})
            self.assertEqual(r.errors["h1"]["status"], "auto_fixed")

    def test_blocked_without_token_and_turns_auto_off(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            r = osr.SelfRepair(d, d, {}, lambda m: None)
            r.report({"fingerprint": "f1", "kind": "crash", "message": "boom"})
            r.tick()
            self.assertEqual(r.repairs[-1]["status"], "blocked")
            self.assertIn("GitHub token", r.repairs[-1]["reason"])
            self.assertFalse(r.settings["auto"])
            self.assertEqual(r.errors["f1"]["status"], "new")



@unittest.skipUnless(shutil.which("git"), "needs git")
class LiveStatsTests(unittest.TestCase):
    def test_parse_gpu_live(self):
        g = ogds.parse_gpu_live("37, 6144, 16303, 61\n")
        self.assertEqual(g, {"gpu_pct": 37.0, "vram_used_gb": 6.0, "vram_total_gb": 15.9, "temp_c": 61.0})
        self.assertIsNone(ogds.parse_gpu_live("[N/A], x\n"))

    def test_live_stats_shape(self):
        ogds.live_stats()
        s = ogds.live_stats()
        self.assertIn("gpu", s)
        if s["cpu_pct"] is not None:
            self.assertTrue(0 <= s["cpu_pct"] <= 100)
        if s["ram_pct"] is not None:
            self.assertTrue(0 <= s["ram_pct"] <= 100)


class OwnerIdeasTests(unittest.TestCase):
    def test_hint_and_idea_go_into_the_prompt(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            r = osr.SelfRepair(d, d, {}, lambda m: None)
            r.report({"fingerprint": "f1", "kind": "error", "message": "boom", "detail": {}})
            r.errors["f1"]["status"] = "failed"
            self.assertTrue(r.set_hint("f1", "check the null case in Create"))
            self.assertEqual(r.errors["f1"]["status"], "new")
            self.assertFalse(r.set_hint("nope", "x"))
            p = osr.build_prompt("mem", r.errors["f1"], {})
            self.assertIn("owner's idea", p)
            self.assertIn("check the null case", p)
            self.assertIn("NO_CODE_CHANGE", p)
            idea = r.add_idea("Add a dark mode toggle to settings")
            self.assertEqual(idea["kind"], "idea")
            p = osr.build_prompt("mem", idea, {})
            self.assertIn("owner's request", p)
            self.assertNotIn("reported by the live website", p)

    def test_idea_picks_the_screen_it_names(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "src/components/studio"))
            os.makedirs(os.path.join(d, "src/routes"))
            for f in ("src/components/studio/Settings.tsx", "src/routes/index.tsx"):
                open(os.path.join(d, f), "w").write("export {};\n")
            self.assertIn("src/components/studio/Settings.tsx", osr.pick_files(d, {"kind": "idea", "message": "make settings clearer"}))
            self.assertEqual(osr.pick_files(d, {"kind": "idea", "message": "zzz qqq"}), ["src/routes/index.tsx"])


class SelfRepairEndToEnd(unittest.TestCase):
    """A full repair: clone, OG BOT writes a fix, checks pass, commit pushed to main."""

    def test_fix_is_checked_committed_and_pushed(self):
        import tempfile, threading, json as J, subprocess as sp
        from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
        with tempfile.TemporaryDirectory() as d:
            # "GitHub": a bare repo with one buggy file
            origin, seed = os.path.join(d, "origin.git"), os.path.join(d, "seed")
            sp.run(["git", "init", "-q", "--bare", "-b", "main", origin], check=True)
            os.makedirs(os.path.join(seed, "src/components/studio"))
            open(os.path.join(seed, "src/components/studio/Create.tsx"), "w").write("export const label = brokenThing;\n")
            for c in (["init", "-q", "-b", "main"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed"], ["push", "-q", origin, "main"]):
                sp.run(["git", *c], cwd=seed, check=True)
            # fake Ollama returning a fix
            class H(BaseHTTPRequestHandler):
                def log_message(self, *a): pass
                def do_POST(self):
                    self.rfile.read(int(self.headers["Content-Length"]))
                    msg = "### `src/components/studio/Create.tsx`\n```tsx\nexport const label = \"fixed\";\n```\nSUMMARY: define the label"
                    b = J.dumps({"message": {"content": msg}}).encode()
                    self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
            srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            osr.OLLAMA_CHAT = f"http://127.0.0.1:{srv.server_address[1]}/api/chat"
            # fake Bun whose checks pass
            bindir = os.path.join(d, "bin"); os.makedirs(bindir)
            open(os.path.join(bindir, "bun"), "w").write("#!/bin/sh\necho ok\nexit 0\n"); os.chmod(os.path.join(bindir, "bun"), 0o755)
            old = os.environ["PATH"]; os.environ["PATH"] = bindir + os.pathsep + old
            try:
                here = os.path.join(d, "drive", "OG-BOT"); os.makedirs(here)
                r = osr.SelfRepair(here, os.path.dirname(here), {"remote_url": origin}, lambda m: None)
                r.report({"fingerprint": "abc12345", "kind": "crash", "message": "ReferenceError: brokenThing is not defined",
                          "detail": {"context": {"view": "create"}}})
                r.tick()
            finally:
                os.environ["PATH"] = old; srv.shutdown()
            rec = r.repairs[-1]
            self.assertEqual(rec["status"], "fixed", rec)
            self.assertEqual(r.errors["abc12345"]["status"], "fixed")
            out = sp.run(["git", "--git-dir", origin, "show", "main:src/components/studio/Create.tsx"], capture_output=True, text=True).stdout
            self.assertIn('"fixed"', out)
            log = sp.run(["git", "--git-dir", origin, "log", "-1", "--format=%an|%s", "main"], capture_output=True, text=True).stdout
            self.assertTrue(log.startswith("OG BOT|OG BOT autofix: ReferenceError"), log)
            branches = sp.run(["git", "--git-dir", origin, "branch", "--list", "ogbot/*"], capture_output=True, text=True).stdout
            self.assertIn("ogbot/autofix-abc12345", branches)
            # the owner can review what changed
            self.assertIn("Create.tsx", r.diff(rec["commit"]))
            self.assertEqual(r.diff("not-a-sha;rm"), "not available")
            # one click undo of that exact fix reverts it on main
            self.assertEqual(r.revert(rec["commit"]), "reverted and pushed")
            self.assertEqual(r.errors["abc12345"]["status"], "reverted")
            self.assertEqual(r.revert(rec["commit"]), "already undone")
            out = sp.run(["git", "--git-dir", origin, "show", "main:src/components/studio/Create.tsx"], capture_output=True, text=True).stdout
            self.assertIn("brokenThing", out)
            # the change history lists real commits, and the owner can revert any of them
            h = r.history()
            subjects = [c["subject"] for c in h["commits"]]
            self.assertIn("seed", subjects)
            self.assertTrue(any(s.startswith("Revert") for s in subjects), subjects)
            seed_sha = next(c["sha"] for c in h["commits"] if c["subject"] == "seed")
            self.assertEqual(r.revert(seed_sha), "reverted and pushed")
            self.assertEqual(r.revert("deadbeef"), "nothing to undo")


if __name__ == "__main__":
    unittest.main()
