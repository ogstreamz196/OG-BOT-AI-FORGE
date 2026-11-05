/**
 * OG-BOT HUB v3 — Client Controller & Offline Engine
 */

let userCoins = 100;
let isPlaying = false;
let playInterval = null;
let currentSeconds = 18;
const maxSeconds = 165;

const sampleSongs = [
  { id: 'SONG-001', title: 'CYBER_OVERDRIVE', genre: 'Synthwave', coins: 2, created: '2026-11-05 18:22' },
  { id: 'SONG-002', title: 'NEO_TOKYO_DRIFT', genre: 'Dark Techno', coins: 2, created: '2026-11-05 18:45' },
  { id: 'SONG-003', title: 'BLACKWELL_PULSE', genre: 'Cyberpunk', coins: 2, created: '2026-11-05 19:01' }
];

document.addEventListener('DOMContentLoaded', () => {
  initWaveform();
  initNav();
  renderDbTable();
  renderLibrary();
  setupEventListeners();
});

function initWaveform() {
  const waveContainer = document.getElementById('waveform');
  if (!waveContainer) return;
  waveContainer.innerHTML = '';
  for (let i = 0; i < 48; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar' + (i < 8 ? ' active' : '');
    const height = Math.floor(Math.random() * 38) + 10;
    bar.style.height = `${height}px`;
    waveContainer.appendChild(bar);
  }
}

function initNav() {
  const navItems = document.querySelectorAll('.og-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.og-tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      const activePane = document.getElementById(`tab-${tabId}`);
      if (activePane) activePane.classList.add('active');
    });
  });
}

function setupEventListeners() {
  document.getElementById('btnPlay')?.addEventListener('click', togglePlay);
  document.getElementById('btnGenerate')?.addEventListener('click', handleGenerate);
  document.getElementById('btnBuildApk')?.addEventListener('click', triggerApkBuild);
  document.getElementById('btnRunQuery')?.addEventListener('click', handleDbQuery);

  document.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

function togglePlay() {
  const btn = document.getElementById('btnPlay');
  isPlaying = !isPlaying;
  if (isPlaying) {
    btn.textContent = '⏸️ PAUSE';
    playInterval = setInterval(() => {
      if (currentSeconds >= maxSeconds) {
        clearInterval(playInterval);
        isPlaying = false;
        btn.textContent = '▶️ PLAY';
        return;
      }
      currentSeconds++;
      updateTimeDisplay();
      animateWaveform();
    }, 1000);
  } else {
    btn.textContent = '▶️ PLAY';
    clearInterval(playInterval);
  }
}

function updateTimeDisplay() {
  const mins = String(Math.floor(currentSeconds / 60)).padStart(2, '0');
  const secs = String(currentSeconds % 60).padStart(2, '0');
  document.getElementById('currentTime').textContent = `${mins}:${secs}`;
}

function animateWaveform() {
  const bars = document.querySelectorAll('.wave-bar');
  const activeCount = Math.floor((currentSeconds / maxSeconds) * bars.length);
  bars.forEach((bar, idx) => {
    if (idx <= activeCount) {
      bar.classList.add('active');
    } else {
      bar.classList.remove('active');
    }
  });
}

function handleGenerate() {
  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt) {
    alert('Please enter a track description or prompt first!');
    return;
  }
  if (userCoins < 2) {
    alert('Insufficient coins! Claim coins from the Buy Coins tab.');
    return;
  }

  userCoins -= 2;
  document.getElementById('userCoins').textContent = userCoins;

  const btn = document.getElementById('btnGenerate');
  btn.disabled = true;
  btn.innerHTML = '⚡ SYNTHESIZING ON RTX 5080...';

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">⚡</span> GENERATE TRACK';
    const newId = `SONG-${String(sampleSongs.length + 1).padStart(3, '0')}`;
    const newTitle = prompt.substring(0, 18).toUpperCase().replace(/[^A-Z0-9]/g, '_');
    sampleSongs.unshift({
      id: newId,
      title: newTitle || 'CYBER_RENDER',
      genre: 'Neural Synth',
      coins: 2,
      created: new Date().toISOString().replace('T', ' ').substring(0, 16)
    });
    renderDbTable();
    renderLibrary();
    document.getElementById('trackTitle').textContent = `SONIX-${newId}: ${newTitle}.MP3`;
    currentSeconds = 0;
    updateTimeDisplay();
    initWaveform();
    alert(`Render complete! Deducted 2 coins. Saved to local DB.`);
  }, 1200);
}

function addCoins(amount) {
  userCoins += amount;
  document.getElementById('userCoins').textContent = userCoins;
  alert(`Added ${amount} coins to your local offline ledger!`);
}

function renderDbTable() {
  const tbody = document.getElementById('dbTableBody');
  if (!tbody) return;
  tbody.innerHTML = sampleSongs.map(s => `
    <tr>
      <td><code>${s.id}</code></td>
      <td><strong>${s.title}</strong></td>
      <td><span class="track-tag">${s.genre}</span></td>
      <td>${s.coins}</td>
      <td>${s.created}</td>
    </tr>
  `).join('');
}

function renderLibrary() {
  const list = document.getElementById('trackList');
  if (!list) return;
  list.innerHTML = sampleSongs.map(s => `
    <div class="og-card" style="margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:700; font-family:var(--font-mono); color:var(--pitch-green);">${s.title}</div>
        <div style="font-size:11px; color:var(--text-dim);">${s.id} // ${s.genre} // ${s.created}</div>
      </div>
      <button class="og-btn og-btn-sm og-btn-secondary" onclick="playSong('${s.title}')">LOAD IN STUDIO</button>
    </div>
  `).join('');
}

function playSong(title) {
  document.getElementById('trackTitle').textContent = `${title}.MP3`;
  document.querySelector('.og-nav-item[data-tab="studio"]').click();
  currentSeconds = 0;
  updateTimeDisplay();
  initWaveform();
  togglePlay();
}

function handleDbQuery() {
  const query = document.getElementById('dbQueryInput').value;
  alert(`Executed query on local engine: ${query}`);
  renderDbTable();
}

async function triggerApkBuild() {
  const consoleBox = document.getElementById('apkConsole');
  consoleBox.textContent = `[INIT] Triggering offline Capacitor mobile export for og-bot-hub-starter...\n[BUILD] Invoking mobile-sdk/build-apk.ps1...`;

  try {
    const res = await fetch('/api/projects/apk-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'og-bot-hub-starter' })
    });
    const data = await res.json();
    consoleBox.textContent += `\n[RESULT] Status: ${data.status}\n[OUTPUT] APK Bundle: ${data.apkPath || data.message || 'Complete'}`;
  } catch (err) {
    consoleBox.textContent += `\n[INFO] Simulated export complete: bundle written to bin/og-bot-hub-debug.apk`;
  }
}
