'use strict';
// ─── DATA ───────────────────────────────────────────────────────────────────
const ME = { onion: 'v33x7p2mka4k9qr.onion', alias: 'OPERATOR', pubkey: 'RSA4096:3A9F...C72E' };

const CONTACTS = [
    { id: 'c1', alias: 'Rajan S.', hue: 220, online: true, unread: 2, lastMsg: 'Circuit check confirmed ✓', lastTime: '23:41', burn: true, vault: false },
    { id: 'c2', alias: 'Priya M.', hue: 160, online: true, unread: 0, lastMsg: 'Sending encoded payload…', lastTime: '22:15', burn: false, vault: false },
    { id: 'c3', alias: 'Arjun V.', hue: 300, online: false, unread: 0, lastMsg: 'Key handshake complete', lastTime: 'Tue', burn: false, vault: false },
    { id: 'c4', alias: 'Keerthi B.', hue: 40, online: false, unread: 1, lastMsg: 'Node sync initiated', lastTime: 'Mon', burn: false, vault: false },
];
const VAULT_CONTACTS = [
    { id: 'v1', alias: 'Node-Alpha', hue: 140, online: true, unread: 3, lastMsg: 'Rendezvous confirmed', lastTime: '01:20', burn: true, vault: true },
    { id: 'v2', alias: 'Node-Beta', hue: 180, online: false, unread: 0, lastMsg: 'Circuit active', lastTime: '23:00', burn: false, vault: true },
];

const MSGS = {
    c1: [
        { id: 'm1', out: false, text: 'Circuit check: 4 hops, latency 180ms. All nominal.', time: '23:31', burnPct: 100, burnSec: 60 },
        { id: 'm2', out: true, text: 'Copy. Sending payload — verify checksum on your end.', time: '23:32', burnPct: null },
        { id: 'm3', out: false, text: 'SHA3-512 match ✓  No EXIF data. Clean transfer.', time: '23:33', burnPct: 100, burnSec: 45 },
        { id: 'm4', out: true, text: 'Vault key rotated. Old session keys destroyed.', time: '23:35', burnPct: null },
        { id: 'm5', out: false, text: 'Acknowledged. Standing by on hidden service.', time: '23:41', burnPct: 100, burnSec: 90 },
    ],
    c2: [
        { id: 'm6', out: false, text: 'Lab keys uploaded. 4096-bit pair generated locally.', time: '22:10', burnPct: null },
        { id: 'm7', out: true, text: 'Receipt confirmed. Running secondary circuit verification.', time: '22:12', burnPct: null },
        { id: 'm8', out: false, text: 'Circuit ready. Latency optimal ✓', time: '22:15', burnPct: null },
    ],
    c3: [
        { id: 'm9', out: true, text: 'Secure node — confirm your relay.', time: 'Tue 18:00', burnPct: null },
        { id: 'm10', out: false, text: 'Key handshake complete. Encrypted channel open.', time: 'Tue 18:04', burnPct: null },
    ],
    c4: [
        { id: 'm11', out: false, text: 'Node sync initiated. Awaiting acknowledgement.', time: 'Mon 09:20', burnPct: 100, burnSec: 120 },
    ],
    v1: [
        { id: 'v11', out: false, text: 'Rendezvous confirmed. Three nodes active.', time: '01:18', burnPct: 100, burnSec: 30 },
        { id: 'v12', out: true, text: 'Understood. Rotating circuit in 10 minutes.', time: '01:20', burnPct: null },
    ],
    v2: [
        { id: 'v21', out: false, text: 'Circuit active. Watching the channel.', time: '23:00', burnPct: null },
    ],
};

const CIRCUIT_NODES = [
    { country: '🇩🇪', city: 'Frankfurt', label: 'GUARD' },
    { country: '🇳🇱', city: 'Amsterdam', label: 'RELAY' },
    { country: '🇸🇬', city: 'Singapore', label: 'EXIT' },
];

const SPLASH_LOGS = [
    { delay: 200, html: '<span class="ok">[+]</span> Starting Tor daemon…' },
    { delay: 700, html: '<span class="ok">[+]</span> Generating RSA-4096 keypair…' },
    { delay: 1300, html: '<span class="ok">[+]</span> Onion address: <span class="val">v33x7p2...onion</span>' },
    { delay: 1900, html: '<span class="ok">[+]</span> Building circuit (3 hops)…' },
    { delay: 2600, html: '<span class="ok">[+]</span> Guard: <span class="val">DE-Frankfurt-01</span>' },
    { delay: 3300, html: '<span class="ok">[+]</span> Relay: <span class="val">NL-Amsterdam-07</span>' },
    { delay: 3900, html: '<span class="ok">[+]</span> Circuit bootstrap: <span class="hi">100%</span>' },
    { delay: 4500, html: '<span class="ok">[+]</span> Unlocking SQLCipher vault…' },
    { delay: 5100, html: '<span class="ok">[+]</span> 4 contacts · 3 vaulted chats · <span class="hi">Ready.</span>' },
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let state = {
    screen: 'splash',
    contact: null,
    msgs: {},
    burnTimers: {},
    vaultOpen: false,
    circuitOpen: false,
    toggles: { e2e: true, burn: true, exif: true, notif: true, deadman: false },
};
// Deep copy messages
Object.keys(MSGS).forEach(k => { state.msgs[k] = MSGS[k].map(m => ({ ...m, burned: false, burnActive: false })); });

// ─── GEO AVATAR ──────────────────────────────────────────────────────────────
function drawAvatar(canvas, hue, seed) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    // Background
    ctx.fillStyle = `hsl(${hue},40%,10%)`;
    ctx.fillRect(0, 0, s, s);
    // Geometric shapes from seed
    const rng = (n) => ((Math.abs(Math.sin(seed + n)) * 9999) % 1);
    for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.globalAlpha = 0.3 + rng(i) * 0.5;
        ctx.fillStyle = `hsl(${hue + rng(i + 10) * 60},70%,${40 + rng(i + 20) * 30}%)`;
        const x = rng(i + 1) * s, y = rng(i + 2) * s, r = 10 + rng(i + 3) * 30;
        if (i % 3 === 0) {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        } else if (i % 3 === 1) {
            ctx.translate(x, y); ctx.rotate(rng(i + 5) * Math.PI);
            ctx.fillRect(-r / 2, -r / 2, r, r);
        } else {
            ctx.translate(x, y); ctx.rotate(rng(i + 6) * Math.PI);
            ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
}

function makeAvatarEl(hue, seed, size = 50) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    drawAvatar(c, hue, seed);
    return c;
}

// ─── SCREEN TRANSITIONS ───────────────────────────────────────────────────────
function showScreen(id, dir = 'right') {
    const prev = document.querySelector('.screen.active');
    const next = document.getElementById('screen-' + id);
    if (!next || prev === next) return;
    if (prev) {
        prev.classList.remove('active');
        if (dir === 'right') prev.classList.add('slide-out-left');
        setTimeout(() => prev.classList.remove('slide-out-left'), 350);
    }
    next.classList.add('active', dir === 'right' ? 'slide-in-right' : 'slide-in-left');
    setTimeout(() => next.classList.remove('slide-in-right', 'slide-in-left'), 350);
    state.screen = id;
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function runSplash() {
    const logEl = document.getElementById('splash-logs');
    const bar = document.getElementById('splash-bar');
    const pct = document.getElementById('splash-pct');
    const conBar = document.querySelector('.conn-bar');

    conBar.classList.add('connecting');

    SPLASH_LOGS.forEach((entry, i) => {
        setTimeout(() => {
            const div = document.createElement('div');
            div.className = 'tlog'; div.innerHTML = entry.html;
            logEl.appendChild(div);
            requestAnimationFrame(() => div.classList.add('show'));
            logEl.scrollTop = logEl.scrollHeight;
            const p = Math.round(((i + 1) / SPLASH_LOGS.length) * 100);
            bar.style.width = p + '%';
            pct.textContent = p + '%';
        }, entry.delay);
    });

    const done = SPLASH_LOGS[SPLASH_LOGS.length - 1].delay + 800;
    setTimeout(() => {
        conBar.classList.remove('connecting');
        conBar.classList.add('connected');
        setTimeout(() => { showScreen('hub', 'right'); buildHub(); }, 500);
    }, done);
}

// ─── HUB ──────────────────────────────────────────────────────────────────────
function buildHub() {
    renderContactList('contact-list', CONTACTS);
    updateNavActive('nav-chat');
}

function renderContactList(elId, contacts) {
    const list = document.getElementById(elId);
    if (!list) return;
    list.innerHTML = '';
    contacts.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'contact-row fade-up';
        row.style.animationDelay = (i * 0.05) + 's';

        // Geo avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'geo-avatar';
        avatarDiv.appendChild(makeAvatarEl(c.hue, i + 1));
        row.appendChild(avatarDiv);

        // Info
        const info = document.createElement('div');
        info.className = 'contact-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'contact-name';

        const dot = document.createElement('span');
        dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:${c.online ? '#2E5BFF' : '#333'};${c.online ? 'box-shadow:0 0 5px #2E5BFF' : ''};`;
        nameEl.appendChild(dot);
        nameEl.appendChild(document.createTextNode(c.alias));

        const prevEl = document.createElement('div');
        prevEl.className = 'contact-preview';
        prevEl.textContent = c.lastMsg;

        info.appendChild(nameEl);
        info.appendChild(prevEl);
        row.appendChild(info);

        // Meta
        const meta = document.createElement('div');
        meta.className = 'contact-meta';
        const time = document.createElement('div');
        time.className = 'contact-time';
        time.textContent = c.lastTime;
        meta.appendChild(time);
        if (c.unread > 0) { const b = document.createElement('div'); b.className = 'unread-badge'; b.textContent = c.unread; meta.appendChild(b); }
        if (c.burn) { const bb = document.createElement('div'); bb.className = 'burn-badge'; bb.textContent = '⏱ BURN'; meta.appendChild(bb); }
        if (c.vault) { const vb = document.createElement('div'); vb.className = 'vault-badge'; vb.textContent = '🔒 VAULT'; meta.appendChild(vb); }
        row.appendChild(meta);

        row.addEventListener('click', () => openConversation(c));
        list.appendChild(row);
    });
}

// ─── VAULT FLOW ───────────────────────────────────────────────────────────────
function openVaultOverlay() {
    document.getElementById('vault-overlay').classList.add('show');
}
function cancelVault() {
    document.getElementById('vault-overlay').classList.remove('show');
}
function confirmBiometric() {
    document.getElementById('vault-overlay').classList.remove('show');
    // animate ring scan
    const ringPath = document.querySelector('#vault-overlay .bio-ring-svg-path');
    if (ringPath) {
        ringPath.style.stroke = '#00E676';
        ringPath.style.strokeDashoffset = '0';
    }
    setTimeout(() => { showVaultScreen(); }, 300);
}
function showVaultScreen() {
    showScreen('vault', 'right');
    renderContactList('vault-list', VAULT_CONTACTS);
    document.getElementById('screen-vault').querySelector('.nav-item[data-nav="chat"]') &&
        updateNavActive('vault-nav-chat');
}

// ─── CONVERSATION ─────────────────────────────────────────────────────────────
function openConversation(contact) {
    state.contact = contact;
    // Header
    const avatarWrap = document.getElementById('conv-avatar');
    avatarWrap.innerHTML = '';
    avatarWrap.appendChild(makeAvatarEl(contact.hue, CONTACTS.indexOf(contact) + VAULT_CONTACTS.indexOf(contact) + 2, 38));

    document.getElementById('conv-name').textContent = contact.alias;
    const statusTxt = contact.online
        ? `<span style="color:#2E5BFF">● online</span> · hidden service active`
        : `<span style="color:#333">● offline</span> · queued delivery`;
    document.getElementById('conv-status').innerHTML = statusTxt;

    // Unread clear
    contact.unread = 0;

    renderMessages();
    showScreen('conv', 'right');
}

function renderMessages() {
    const area = document.getElementById('msgs-area');
    area.innerHTML = '';
    const contactMsgs = state.msgs[state.contact.id] || [];

    const sys = document.createElement('div');
    sys.className = 'sys-msg';
    sys.textContent = '🔐 End-to-end encrypted via Tor · AES-256';
    area.appendChild(sys);

    contactMsgs.forEach(msg => {
        if (msg.burned) return;
        appendMessage(msg, area, false);
    });
    area.scrollTop = area.scrollHeight;
}

function appendMessage(msg, area, animate) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.out ? 'out' : 'in') + (animate ? ' fade-up' : '');
    row.id = 'row-' + msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.id = 'bubble-' + msg.id;
    bubble.innerHTML = msg.text.replace(/\n/g, '<br>');

    if (msg.burnPct !== null && msg.burnPct !== undefined && !msg.burnActive) {
        const bwrap = document.createElement('div');
        bwrap.className = 'burn-bar-wrap';
        bwrap.title = 'Tap to start burn timer';
        const bfill = document.createElement('div');
        bfill.className = 'burn-bar-fill';
        bfill.style.width = msg.burnPct + '%';
        bwrap.appendChild(bfill);
        bubble.appendChild(bwrap);
        const blabel = document.createElement('div');
        blabel.className = 'burn-label';
        blabel.id = 'burn-label-' + msg.id;
        blabel.textContent = '⏱ ' + msg.burnSec + 's · tap to start';
        bubble.appendChild(blabel);
        bwrap.addEventListener('click', (e) => { e.stopPropagation(); startBurnTimer(msg); });
    }

    const tspan = document.createElement('div');
    tspan.className = 'msg-time';
    tspan.textContent = msg.time;

    if (msg.out) { row.appendChild(tspan); row.appendChild(bubble); }
    else { row.appendChild(bubble); row.appendChild(tspan); }
    area.appendChild(row);
}

function startBurnTimer(msg) {
    if (msg.burnActive) return;
    msg.burnActive = true;
    showToast('⏱ Burn timer started');
    let remaining = msg.burnSec;
    const lbl = document.getElementById('burn-label-' + msg.id);
    const fill = document.querySelector('#bubble-' + msg.id + ' .burn-bar-fill');

    const tick = setInterval(() => {
        remaining--;
        const pct = (remaining / msg.burnSec) * 100;
        if (fill) fill.style.width = pct + '%';
        if (lbl) lbl.textContent = `⏱ ${remaining}s remaining`;
        if (remaining <= 0) {
            clearInterval(tick);
            burnMessage(msg);
        }
    }, 1000);
    state.burnTimers[msg.id] = tick;
}

function burnMessage(msg) {
    const bubble = document.getElementById('bubble-' + msg.id);
    if (!bubble) return;
    bubble.classList.add('dissolving');
    // Pixel dust particles
    spawnPixels(bubble);
    setTimeout(() => {
        const row = document.getElementById('row-' + msg.id);
        if (row) row.remove();
        msg.burned = true;
        showToast('💨 Message dissolved');
    }, 1000);
}

function spawnPixels(el) {
    const rect = el.getBoundingClientRect();
    const phone = document.querySelector('.device').getBoundingClientRect();
    for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        const size = 3 + Math.random() * 6;
        const x = rect.left - phone.left + Math.random() * rect.width;
        const y = rect.top - phone.top + Math.random() * rect.height;
        p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:2px;background:${Math.random() > 0.5 ? '#2E5BFF' : '#6B8FFF'};pointer-events:none;z-index:200;animation:pixel-particle 0.8s ease-out ${Math.random() * 0.3}s forwards;`;
        document.querySelector('.device').appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
}
// Pixel particle CSS (dynamic injection)
const ppStyle = document.createElement('style');
ppStyle.textContent = `@keyframes pixel-particle {
  from { opacity:1; transform:translate(0,0) scale(1); }
  to   { opacity:0; transform:translate(${'' + ''}var(--tx,20px), var(--ty,-30px)) scale(0.2); }
}`;
document.head.appendChild(ppStyle);
// Randomize directions via CSS vars per particle (override)
function injectPixelCSS() {
    const s = document.createElement('style');
    s.id = 'pixel-dyn';
    s.textContent = '';
    document.head.appendChild(s);
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
function sendMsg() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !state.contact) return;
    input.value = '';

    const id = 'msg-' + Date.now();
    const msg = { id, out: true, text, time: 'now', burnPct: null, burned: false, burnActive: false };
    const cid = state.contact.id;
    state.msgs[cid] = state.msgs[cid] || [];
    state.msgs[cid].push(msg);

    const area = document.getElementById('msgs-area');
    appendMessage(msg, area, true);
    area.scrollTop = area.scrollHeight;

    setTimeout(() => simulateReply(cid), 2500 + Math.random() * 2000);
}

function simulateReply(cid) {
    if (state.screen !== 'conv' || !state.contact || state.contact.id !== cid) return;
    const replies = [
        'Circuit integrity confirmed. All hops nominal.',
        'Acknowledged. Key rotation complete.',
        'Message received. No metadata leakage detected.',
        'Payload checksums match. Secure channel active.',
        'Relay node handshake successful.',
    ];
    const text = replies[Math.floor(Math.random() * replies.length)];
    const burnSec = Math.random() > 0.5 ? (20 + Math.floor(Math.random() * 60)) : null;
    const id = 'rep-' + Date.now();
    const msg = { id, out: false, text, time: 'now', burnPct: burnSec ? 100 : null, burnSec, burned: false, burnActive: false };
    state.msgs[cid] = state.msgs[cid] || [];
    state.msgs[cid].push(msg);

    const area = document.getElementById('msgs-area');
    appendMessage(msg, area, true);
    area.scrollTop = area.scrollHeight;
    showToast('📨 Encrypted message received');
}

// ─── CIRCUIT MAP ─────────────────────────────────────────────────────────────
function toggleCircuit() {
    state.circuitOpen = !state.circuitOpen;
    const drawer = document.getElementById('circuit-drawer');
    drawer.classList.toggle('open', state.circuitOpen);
}

// ─── QR ──────────────────────────────────────────────────────────────────────
function buildQR() {
    const grid = document.getElementById('qr-grid');
    if (!grid || grid.children.length > 0) return;
    // 11x11 simplified QR-like pattern
    const pattern = [
        1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1,
        1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0,
        1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1,
        1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,
        1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0,
        0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1,
        1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0,
        0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1,
    ];
    pattern.forEach(b => { const d = document.createElement('div'); d.className = 'qp ' + (b ? 'on' : 'off'); grid.appendChild(d); });
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function updateNavActive(activeId) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === activeId));
}

function navTo(target) {
    if (target === 'chat') { showScreen('hub', 'left'); buildHub(); updateNavActive('nav-chat'); }
    if (target === 'identity') { showScreen('identity', 'right'); buildQR(); updateNavActive('nav-id'); }
    if (target === 'settings') { showScreen('settings', 'right'); updateNavActive('nav-settings'); }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    injectPixelCSS();

    // Splash
    runSplash();

    // Nav
    document.querySelectorAll('.nav-item[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => navTo(btn.dataset.nav));
    });

    // Vault trigger
    document.getElementById('vault-trigger')?.addEventListener('click', openVaultOverlay);
    document.getElementById('vault-cancel-btn')?.addEventListener('click', cancelVault);
    document.getElementById('vault-confirm-btn')?.addEventListener('click', confirmBiometric);

    // Back buttons
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => { showScreen(btn.dataset.back, 'left'); buildHub(); });
    });

    // Circuit map toggle
    document.getElementById('conv-meta-btn')?.addEventListener('click', toggleCircuit);
    document.getElementById('circuit-toggle-btn')?.addEventListener('click', toggleCircuit);

    // Send message
    document.getElementById('send-btn')?.addEventListener('click', sendMsg);
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });

    // QR scan sim
    document.getElementById('scan-area')?.addEventListener('click', () => {
        const area = document.getElementById('scan-area');
        area.innerHTML = `<div style="color:#2E5BFF;font-family:monospace;font-size:12px;text-align:center;padding:20px">✓ Node scanned<br><span style="color:#555;font-size:10px">Node-Gamma · r8m2...onion<br>RSA-4096 key imported</span></div>`;
        showToast('✅ Node added to vault');
    });
    document.getElementById('manual-add-btn')?.addEventListener('click', () => {
        const v = document.getElementById('manual-input').value.trim();
        if (v) { showToast('✅ Node added: ' + v.slice(0, 20)); document.getElementById('manual-input').value = ''; }
    });

    // Settings toggles
    document.querySelectorAll('.toggle-sw').forEach(tog => {
        const k = tog.dataset.key;
        if (state.toggles[k]) tog.classList.add('on');
        tog.addEventListener('click', () => {
            state.toggles[k] = !state.toggles[k];
            tog.classList.toggle('on', state.toggles[k]);
            showToast(k + ': ' + (state.toggles[k] ? 'ON' : 'OFF'));
        });
    });

    // Panic (lock)
    document.getElementById('panic-btn')?.addEventListener('click', () => {
        Object.values(state.burnTimers).forEach(clearInterval);
        state.burnTimers = {};
        showScreen('hub', 'left');
        buildHub();
        showToast('🔒 Session locked');
    });

    // Vault back
    document.getElementById('vault-back')?.addEventListener('click', () => {
        showScreen('hub', 'left'); buildHub();
    });
    document.querySelectorAll('#vault-list .contact-row')?.forEach(() => { });
    document.addEventListener('click', e => {
        const vaultRow = e.target.closest('#vault-list .contact-row');
        if (vaultRow) {
            const idx = Array.from(vaultRow.parentElement.children).indexOf(vaultRow);
            if (VAULT_CONTACTS[idx]) openConversation(VAULT_CONTACTS[idx]);
        }
    });
});
