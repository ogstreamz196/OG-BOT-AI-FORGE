"""Self-test for og-drive-server.py:  python test_og_drive_server.py"""
import importlib.util, os, unittest

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


if __name__ == "__main__":
    unittest.main()
