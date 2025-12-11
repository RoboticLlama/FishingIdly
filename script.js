/* ---------------- Firebase Setup ---------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import {
  getFirestore, doc, getDoc, setDoc, getDocs, collection
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnoFqUUjddA6ipJSisLOS7MsFklhQKt_w",
  authDomain: "fishingidly-c1613.firebaseapp.com",
  projectId: "fishingidly-c1613",
  storageBucket: "fishingidly-c1613.firebasestorage.app",
  messagingSenderId: "531215063717",
  appId: "1:531215063717:web:dea4ce7aa7a64d3f374b4c",
  measurementId: "G-SR67MT90SE"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch(e) { /* analytics may fail on http */ }
const db = getFirestore(app);

/* --------------- Minimal Firestore adapter --------------- */
let playersCache = [];

async function refreshPlayersCache() {
  const snap = await getDocs(collection(db, "players"));
  playersCache = snap.docs.map(d => d.data());
}

function cleanForFirestore(obj) {
  const cleaned = { ...obj };
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) delete cleaned[key];
  });
  return cleaned;
}

function writePlayerToDB(p) {
  const safeData = cleanForFirestore(p);
  setDoc(doc(db, "players", p.username), safeData, { merge: true }).catch(console.error);
  const i = playersCache.findIndex(x => x.username === p.username);
  if (i === -1) playersCache.push(p);
  else playersCache[i] = p;
}

function getPlayers() { return playersCache.slice(); }
function savePlayers(players) {
  playersCache = players.slice();
  players.forEach(p => writePlayerToDB(p));
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
}
function setCurrentUser(u) { localStorage.setItem('currentUser', JSON.stringify(u)); }

/* ------------------ DOM elements ------------------ */
const overlay = document.getElementById('overlay');
const signinLink = document.getElementById('signinLink');
const startButton = document.getElementById('startButton');
const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');
const showSignup = document.getElementById('showSignup');
const showSignin = document.getElementById('showSignin');
const gameContainer = document.getElementById('gameContainer');
const mainContent = document.getElementById('mainContent');
const title = document.getElementById('title');
const logoutBtn = document.getElementById('logoutBtn');
const adminResetBtn = document.getElementById('adminResetBtn');
const adminPanel = document.getElementById('adminPanel');

/* --- Global delegation for Pond/Stream --- */
mainContent.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.id === 'pondBtn') { e.preventDefault(); showPond(); }
  if (btn.id === 'streamBtn') { e.preventDefault(); showStream(); }
});

/* Unlock modal */
const unlockOverlay = document.getElementById('unlockOverlay');
function showUnlockModal(areaName = 'Stream') {
  if (!unlockOverlay) return;
  unlockOverlay.style.display = 'flex';
  const btn = document.getElementById('unlockOkBtn');
  if (btn) btn.onclick = () => { unlockOverlay.style.display = 'none'; };
}

/* Modal behavior */
const openModal = () => overlay.style.display = 'flex';
signinLink.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
startButton.addEventListener('click', (e) => { e.preventDefault?.(); openModal(); });
showSignup.addEventListener('click', () => { signinForm.style.display='none'; signupForm.style.display='block'; });
showSignin.addEventListener('click', () => { signupForm.style.display='none'; signinForm.style.display='block'; });
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

/* Per-user flags */
function getUserFlags() {
  const cu = getCurrentUser();
  if (!cu) return {};
  return cu.flags || {};
}
function setUserFlags(nextFlags) {
  const cu = getCurrentUser();
  if (!cu) return;
  cu.flags = { ...(cu.flags||{}), ...nextFlags };
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) {
    players[idx].flags = cu.flags;
    savePlayers(players);
  }
}

/* Stats */
function defaultStats() { return { level: 1, xp: 0 }; }
function xpNeededFor(level) { return 20 + (level - 1) * 10; }

function maybeNotifyStreamUnlock(prevLevel, nextLevel) {
  if (prevLevel < 10 && nextLevel >= 10 && !getUserFlags().streamUnlockNotified) {
    setUserFlags({ streamUnlockNotified: true });
    showUnlockModal('Stream');
  }
}

function getStats() {
  const cu = getCurrentUser();
  if (!cu) return defaultStats();
  cu.level = cu.level ?? 1;
  cu.xp = cu.xp ?? 0;
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) {
    players[idx].level = cu.level;
    players[idx].xp = cu.xp;
    savePlayers(players);
  }
  return { level: cu.level, xp: cu.xp };
}

function setStats(stats) {
  const prev = getStats();
  const cu = getCurrentUser();
  if (!cu) return;
  cu.level = Math.max(1, stats.level ?? 1);
  cu.xp = stats.xp ?? 0;
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) {
    players[idx].level = cu.level;
    players[idx].xp = cu.xp;
    savePlayers(players);
  }
  maybeNotifyStreamUnlock(prev.level, cu.level);
  updateGoldHud();
  renderAdminPanel();
}

/* Showcase */
const SHOWCASE_LIMIT = 10;

/* XP / Level */
function addXP(amount) {
  const before = getStats();
  let xp = (before.xp ?? 0) + amount;
  let level = before.level ?? 1;
  let leveled = 0;
  while (xp >= xpNeededFor(level)) {
    xp -= xpNeededFor(level);
    level += 1;
    leveled += 1;
  }
  maybeNotifyStreamUnlock(before.level, level);
  setStats({ ...before, xp, level });
  xpPopup(`+${amount} XP`);
  if (leveled > 0) {
    goldPopup(`⭐ Level Up! Lv ${before.level} → ${level}`);
  }
}

/* HUD + currency */
function goldHudEl() { return document.getElementById('goldHud'); }
function updateGoldHud() {
  const cu = getCurrentUser();
  const s = getStats();
  const el = goldHudEl();
  if (el) el.textContent = `💰 ${cu?.coins ?? 0} · ⭐ Lv ${s.level} (${s.xp}/${xpNeededFor(s.level)})`;
}
function addGold(amount) {
  const cu = getCurrentUser();
  if (!cu) return;
  cu.coins = (cu.coins ?? 0) + amount;
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) { players[idx].coins = cu.coins; savePlayers(players); }
  updateGoldHud();
  goldPopup(`+${amount} gold`);
  renderAdminPanel();
}
function setGold(newAmount) {
  const cu = getCurrentUser();
  if (!cu) return;
  cu.coins = Math.max(0, Math.floor(newAmount||0));
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) { players[idx].coins = cu.coins; savePlayers(players); }
  updateGoldHud();
  renderAdminPanel();
}
function goldPopup(text) {
  const el = document.createElement('div');
  el.className = 'gold-pop';
  el.textContent = text;
  mainContent.appendChild(el);
  setTimeout(()=> el.remove(), 1000);
}
function xpPopup(text) {
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.textContent = text;
  mainContent.appendChild(el);
  setTimeout(()=> el.remove(), 1100);
}

/* Variant helpers */
const VALID_VARIANTS = new Set(['none','bronze','silver','gold','diamond','rainbow']);
function normalizeVariantKey(v){
  if (!v) return 'none';
  const s = String(v).toLowerCase().trim();
  if (s==='copper') return 'bronze';
  return VALID_VARIANTS.has(s)?s:'none';
}
function prettyLabelFromKey(k){
  switch (normalizeVariantKey(k)) {
    case 'bronze': return 'Bronze';
    case 'silver': return 'Silver';
    case 'gold': return 'Gold';
    case 'diamond': return 'Diamond';
    case 'rainbow': return 'Rainbow';
    default: return '';
  }
}

/* Size tiers */
const SIZE_TIERS = [
  { key:'micro', label:'Micro', chance:0.06, mult:0.75 },
  { key:'small', label:'Small', chance:0.13, mult:0.90 },
  { key:'big', label:'Big', chance:0.07, mult:1.15 },
  { key:'queen', label:'Queen', chance:0.035, mult:1.35 },
  { key:'king', label:'King', chance:0.010, mult:1.60 },
];
function rollSizeTier(){
  const pool = SIZE_TIERS;
  const total = pool.reduce((a,c)=>a+(c.chance||0),0);
  const r = Math.random();
  let acc = 0;
  for (const s of pool) {
    acc += (s.chance||0);
    if (r < acc) return s;
  }
  return { key:'normal', label:'', mult:1.0 };
}

/* Rod & Bait configurations */
const ROD_TYPES = [
  {id: 'starter', name: 'Starter Rod', cost: 0, effects: {zoneBonus: 0, wobbleMult: 1.0, driftMult: 1.0}},
  {id: 'bamboo', name: 'Bamboo Rod', cost: 50, effects: {zoneBonus: 3, wobbleMult: 0.95, driftMult: 1.0}},
  {id: 'fiberglass', name: 'Fiberglass Rod', cost: 150, effects: {zoneBonus: 6, wobbleMult: 0.90, driftMult: 0.97}},
  {id: 'carbon', name: 'Carbon Fiber Rod', cost: 400, effects: {zoneBonus: 10, wobbleMult: 0.82, driftMult: 0.93}},
  {id: 'master', name: 'Master Angler Rod', cost: 1200, effects: {zoneBonus: 15, wobbleMult: 0.75, driftMult: 0.88}}
];

const BAIT_TYPES = [
  {id: 'none', name: 'No Bait', cost: 0, effects: {searchMult: 1.0, valueMult: 1.0, xpMult: 1.0}},
  {id: 'worm', name: 'Worms', cost: 5, effects: {searchMult: 0.95, valueMult: 1.0, xpMult: 1.0}},
  {id: 'dough', name: 'Dough Balls', cost: 15, effects: {searchMult: 0.92, valueMult: 1.05, xpMult: 1.0}},
  {id: 'minnow', name: 'Live Minnows', cost: 30, effects: {searchMult: 0.88, valueMult: 1.05, xpMult: 1.1}},
  {id: 'lure', name: 'Spinner Lure', cost: 60, effects: {searchMult: 0.85, valueMult: 1.1, xpMult: 1.1}},
  {id: 'powerbait', name: 'PowerBait', cost: 120, effects: {searchMult: 0.82, valueMult: 1.15, xpMult: 1.2}}
];

/* Inventory */
function getInventory() {
  const cu = getCurrentUser();
  if (!cu) return [];
  const raw = cu.items || [];
  const upgraded = raw.map(it => {
    if (typeof it === 'string') {
      const meta = lookupItemMeta(it);
      return { name: meta.name, type: meta.type, value: meta.value ?? 0, favorite: false, variantBaseKey: 'none', variantBaseLabel: '', statusLabel: '', showcased:false, sizeKey:'normal', sizeLabel:'' };
    }
    const normKey = normalizeVariantKey(it.variantBaseKey ?? it.variantBase ?? it.variant ?? it.variantBaseLabel);
    const label = it.variantBaseLabel ?? prettyLabelFromKey(normKey);
    const sizeKeyRaw = (it.sizeKey || it.size || '').toString().toLowerCase();
    const validSizes = ['micro','small','normal','big','queen','king'];
    const safeSize = validSizes.includes(sizeKeyRaw) ? sizeKeyRaw : 'normal';
    const sizeLabel = it.sizeLabel || (safeSize === 'normal' ? '' : safeSize[0].toUpperCase()+safeSize.slice(1));
    return {
      name: it.name,
      type: it.type ?? lookupItemMeta(it.name).type,
      value: (typeof it.value === 'number') ? it.value : (lookupItemMeta(it.name).value ?? 0),
      favorite: !!it.favorite,
      variantBaseKey: normKey,
      variantBaseLabel: label,
      statusLabel: it.statusLabel || '',
      showcased: it.showcased === true,
      sizeKey: safeSize,
      sizeLabel,
      gearId: it.gearId || undefined,
      equipped: !!it.equipped
    };
  });
  if (JSON.stringify(raw) !== JSON.stringify(upgraded)) setInventory(upgraded);
  return upgraded;
}

function setInventory(newInv) {
  const cu = getCurrentUser();
  if (!cu) return;
  cu.items = newInv;
  setCurrentUser(cu);
  const players = getPlayers();
  const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) { players[idx].items = newInv; savePlayers(players); }
}

/* Gear helpers */
function getEquippedRod() {
  const inv = getInventory();
  return inv.find(i => i.type === 'gear-rod' && i.equipped === true);
}
function getEquippedRodEffects() {
  const rod = getEquippedRod();
  return rod ? rod.effects : {zoneBonus: 0, wobbleMult: 1.0, driftMult: 1.0};
}
function getEquippedBait() {
  const inv = getInventory();
  return inv.find(i => i.type === 'gear-bait' && i.equipped === true);
}
function getEquippedBaitEffects() {
  const bait = getEquippedBait();
  return bait ? bait.effects : {searchMult: 1.0, valueMult: 1.0, xpMult: 1.0};
}
function buyGear(gearType, gearId) {
  const types = gearType === 'rod' ? ROD_TYPES : BAIT_TYPES;
  const config = types.find(t => t.id === gearId);
  if (!config) return alert('Invalid gear.');
  const inv = getInventory();
  const existing = inv.find(i => i.gearId === gearId && i.type === `gear-${gearType}`);
  if (existing) return alert(`You already own ${config.name}!`);
  if (!canAfford(config.cost)) return alert('Not enough gold!');
  if (!spendGold(config.cost)) return;
  const item = {
    name: config.name,
    type: `gear-${gearType}`,
    gearId: gearId,
    effects: {...config.effects},
    equipped: false,
    favorite: false,
    showcased: false,
    sizeKey: 'normal',
    sizeLabel: '',
    value: 0
  };
  const hasEquipped = inv.some(i => i.type === item.type && i.equipped);
  if (!hasEquipped) item.equipped = true;
  inv.push(item);
  setInventory(inv);
  goldPopup(`Bought ${config.name}!`);
}
function equipItem(idx) {
  const inv = getInventory();
  const item = inv[idx];
  if (!item || !item.type?.startsWith('gear-')) return;
  inv.forEach((it, i) => {
    if (i !== idx && it.type === item.type && it.equipped) it.equipped = false;
  });
  item.equipped = true;
  setInventory(inv);
  renderBackpack();
}

/* Showcase helpers */
function getShowcaseItems() {
  return getInventory()
    .map((it, idx) => ({ ...it, _idx: idx }))
    .filter(it => it.type === 'fish' && it.showcased === true);
}
function setShowcaseForIndex(index, enabled) {
  const inv = getInventory();
  if (!inv[index] || inv[index].type !== 'fish') return;
  inv[index].showcased = !!enabled;
  setInventory(inv);
}

/* Save catch */
function saveCatchToUser(catchData) {
  if (typeof catchData === 'string') {
    const meta = lookupItemMeta(catchData);
    if (meta && meta.type === 'trash') {
      addGold(meta.value || 0); return;
    }
    const inv = getInventory();
    inv.push({
      name: catchData, type: meta?.type || 'unknown', value: meta?.value || 0,
      favorite: false, variantBaseKey:'none', variantBaseLabel:'', statusLabel:'', showcased:false, sizeKey:'normal', sizeLabel:''
    });
    setInventory(inv);
    return;
  }
  const item = {
    name: catchData.name,
    type: catchData.type || 'fish',
    value: typeof catchData.value === 'number' ? catchData.value : (lookupItemMeta(catchData.name).value || 0),
    favorite: !!catchData.favorite,
    variantBaseKey: normalizeVariantKey(catchData.variantBaseKey || catchData.variant || catchData.variantBaseLabel),
    variantBaseLabel: catchData.variantBaseLabel || prettyLabelFromKey(catchData.variantBaseKey || catchData.variant || catchData.variantBaseLabel),
    statusLabel: catchData.statusLabel || '',
    showcased:false,
    sizeKey: (catchData.sizeKey || 'normal'),
    sizeLabel: (catchData.sizeLabel || '')
  };
  const inv = getInventory();
  inv.push(item);
  setInventory(inv);
}

/* Starter gear */
function ensureStarterGear() {
  let inv = getInventory();
  if (!inv.some(i => i.type === 'gear-rod')) {
    const config = ROD_TYPES.find(r => r.id === 'starter');
    inv.push({
      name: config.name,
      type: 'gear-rod',
      gearId: config.id,
      effects: {...config.effects},
      equipped: true,
      favorite: false,
      showcased: false,
      sizeKey: 'normal',
      sizeLabel: '',
      value: 0
    });
  }
  if (!inv.some(i => i.type === 'gear-bait')) {
    const config = BAIT_TYPES.find(b => b.id === 'none');
    inv.push({
      name: config.name,
      type: 'gear-bait',
      gearId: config.id,
      effects: {...config.effects},
      equipped: true,
      favorite: false,
      showcased: false,
      sizeKey: 'normal',
      sizeLabel: '',
      value: 0
    });
  }
  setInventory(inv);
}

/* Difficulty + minigame params */
const rarityConfig = {
  common: { zoneMin: 28, zoneMax: 72, drift: 0.25, wobble: 0.6, timeToLand: 2200 },
  uncommon: { zoneMin: 33, zoneMax: 67, drift: 0.38, wobble: 0.9, timeToLand: 3000 },
  rare: { zoneMin: 40, zoneMax: 60, drift: 0.55, wobble: 1.2, timeToLand: 3800 },
  epic: { zoneMin: 42, zoneMax: 58, drift: 0.75, wobble: 1.6, timeToLand: 5200 },
  legendary:{ zoneMin: 44, zoneMax: 56, drift: 0.95, wobble: 1.9, timeToLand: 6200 }
};

function weightedPick(table) {
  const total = table.reduce((a,c)=>a+c.weight,0);
  let roll = Math.random() * total;
  for (const item of table) {
    if ((roll -= item.weight) <= 0) return item;
  }
  return table[0];
}

/* Variants + statuses */
const VARIANT_BASES = [
  { key:'none', label:'', mult:1.00, chance:null, wobble:0, zoneNarrow:0, timeUp:0, driftUp:0 },
  { key:'bronze', label:'Bronze', mult:1.25, chance:0.050, wobble:0.05, zoneNarrow:0.02, timeUp:0.02, driftUp:0.05 },
  { key:'silver', label:'Silver', mult:1.50, chance:0.045, wobble:0.10, zoneNarrow:0.03, timeUp:0.04, driftUp:0.08 },
  { key:'gold', label:'Gold', mult:2.00, chance:0.040, wobble:0.15, zoneNarrow:0.04, timeUp:0.06, driftUp:0.12 },
  { key:'diamond', label:'Diamond', mult:3.00, chance:0.020, wobble:0.25, zoneNarrow:0.06, timeUp:0.09, driftUp:0.18 },
  { key:'rainbow', label:'Rainbow', mult:5.00, chance:0.007, wobble:0.35, zoneNarrow:0.08, timeUp:0.12, driftUp:0.22 },
];
const STATUS_POOL = [
  { key:'frozen', label:'Frozen', add:0.25, chance:0.10, wobble:0.05, zoneNarrow:0.01, timeUp:0.02, driftUp:0.03 },
  { key:'electrocuted', label:'Electrocuted', add:0.50, chance:0.10, wobble:0.08, zoneNarrow:0.015, timeUp:0.03, driftUp:0.05 },
  { key:'burned', label:'Burned', add:0.75, chance:0.10, wobble:0.10, zoneNarrow:0.02, timeUp:0.04, driftUp:0.06 },
];
function rollBaseVariant() {
  const sorted = VARIANT_BASES.filter(v=>v.key!=='none').sort((a,b)=>a.chance-b.chance);
  const r = Math.random(); let acc = 0;
  for (const v of sorted) { acc += v.chance; if (r < acc) return v; }
  return VARIANT_BASES[0];
}
function rollSingleStatus() {
  for (const s of STATUS_POOL) { if (Math.random() < s.chance) return s; }
  return null;
}
function buildVariantResult() {
  const base = rollBaseVariant();
  const status = rollSingleStatus();
  const statusMult = status ? (1 + status.add) : 1;
  const totalMult = base.mult * statusMult;
  const diff = {
    wobble: (base.wobble) + (status?.wobble || 0),
    zoneNarrow: (base.zoneNarrow) + (status?.zoneNarrow || 0),
    timeUp: (base.timeUp) + (status?.timeUp || 0),
    driftUp: (base.driftUp) + (status?.driftUp || 0),
  };
  return { base, status, totalMult, diff };
}
function renderStyledFishName(item) {
  const baseKey = normalizeVariantKey(item.variantBaseKey || item.variantBase || item.variant || item.variantBaseLabel);
  const statusKey = (item.statusLabel ? item.statusLabel.toLowerCase() : '').replace(/\s+/g,'');
  const sizeKey = (item.sizeKey || 'normal').toLowerCase();
  const validSizes = ['micro','small','normal','big','queen','king'];
  const safeSize = validSizes.includes(sizeKey) ? sizeKey : 'normal';
  const sizeClass = `size-${safeSize}`;
  const vClass = baseKey && baseKey !== 'none' ? `variant-${baseKey}` : '';
  const sClass = statusKey ? `status-${statusKey}` : '';
  const nameInner = vClass ? `<span class="${vClass} fish-name">${item.name}</span>` : `<span class="fish-name">${item.name}</span>`;
  const sizeTag = safeSize !== 'normal' ? `<span class="size-tag" title="${item.sizeLabel||''}"></span>` : '';
  const wrappedInner = sClass ? `<span class="${sClass}">${nameInner}</span>` : nameInner;
  return `<span class="size-wrap ${sizeClass}">${sizeTag}${wrappedInner}</span>`;
}

/* Auth */
document.getElementById('signupButton').addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  if (!email || !username || !password) return alert("Please fill all fields.");
  const existing = await getDoc(doc(db, "players", username));
  if (existing.exists()) return alert("Username already exists!");
  const rec = { email, username, password, items: [], coins: 0, ...defaultStats(), flags:{} };
  writePlayerToDB(rec);
  alert("Account created!");
  signupForm.style.display = 'none';
  signinForm.style.display = 'block';
  await refreshPlayersCache();
});

function ensureMasterRecord() {
  let players = getPlayers();
  let rec = players.find(p => p.username === "Llama");
  if (!rec) {
    rec = {
      email: "llama@test.local",
      username: "Llama",
      password: "Helloworld",
      items: [],
      coins: 0,
      testAccount: true,
      level: 1,
      xp: 0,
      flags: {}
    };
    players.push(rec);
    savePlayers(players);
  } else {
    rec.password = "Helloworld";
    rec.email = rec.email || "llama@test.local";
    rec.testAccount = true;
    rec.level = rec.level ?? 1;
    rec.xp = rec.xp ?? 0;
    savePlayers(players);
  }
  return rec;
}

document.getElementById('loginButton').addEventListener('click', async () => {
  const u = document.getElementById('signin-username').value.trim();
  const p = document.getElementById('signin-password').value.trim();

  // Master login check
  if (u === "Llama" && p === "Helloworld") {
    const rec = ensureMasterRecord();
    setCurrentUser(rec);
    launchGame(rec.username);
    return;
  }

  // Normal player login
  const snap = await getDoc(doc(db, "players", u));
  if (!snap.exists()) return alert("Invalid credentials!");
  const user = snap.data();
  if (user.password !== p) return alert("Invalid credentials!");
  setCurrentUser(user);
  launchGame(user.username);
});

/* Admin */
function isMasterUser(u = getCurrentUser()) { return !!u && (u.username === 'Llama'); }

function adminResetAllData() {
  if (!isMasterUser()) return;
  const sure = confirm("⚠ This will delete ALL saved players, items, coins, and progress on this device. Continue?");
  if (!sure) return;
  const extra = confirm("Are you absolutely sure? This cannot be undone.");
  if (!extra) return;
  localStorage.removeItem('players');
  localStorage.removeItem('currentUser');
  alert("Local session cleared. (Server data remains.)");
  location.reload();
}

function renderAdminPanel() {
  const cu = getCurrentUser();
  if (!isMasterUser(cu)) {
    adminPanel.style.display = 'none';
    adminResetBtn.style.display = 'none';
    return;
  }

  const s = getStats();
  const coins = cu?.coins ?? 0;

  adminPanel.style.display = 'block';
  adminResetBtn.style.display = 'block';
  adminPanel.className = 'admin-panel';
  adminPanel.innerHTML = `
    <div class="admin-title">🧰 Admin (Master)</div>
    <div class="admin-row">
      <span>Level: <strong>${s.level}</strong></span>
      <div>
        <button class="btn-sm" id="lvlMinus">−1</button>
        <button class="btn-sm" id="lvlPlus">+1</button>
      </div>
    </div>
    <div class="admin-row">
      <span>Gold: <strong>${coins}g</strong></span>
      <div>
        <button class="btn-sm" id="goldMinus">−100</button>
        <button class="btn-sm" id="goldPlus">+100</button>
      </div>
    </div>`;
  document.getElementById('lvlPlus').onclick = () => { const s = getStats(); setStats({ ...s, level: s.level + 1 }); };
  document.getElementById('lvlMinus').onclick = () => { const s = getStats(); setStats({ ...s, level: Math.max(1, s.level - 1) }); };
  document.getElementById('goldPlus').onclick = () => addGold(100);
  document.getElementById('goldMinus').onclick = () => setGold((cu?.coins ?? 0) - 100);
  adminResetBtn.onclick = adminResetAllData;
}

function launchGame(username) {
  overlay.style.display = 'none';
  title.style.display = 'none';
  startButton.style.display = 'none';
  signinLink.style.display = 'none';
  gameContainer.style.display = 'flex';
  ensureStarterGear();
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${(getCurrentUser()?.coins ?? 0)} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    Welcome back, <strong>${username}</strong>! Choose where to go.
  `;
  updateGoldHud();
  renderAdminPanel();
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('currentUser');
  gameContainer.style.display = 'none';
  title.style.display = 'block';
  startButton.style.display = 'block';
  signinLink.style.display = 'block';
  mainContent.innerHTML = "";
  adminResetBtn.style.display = 'none';
  adminPanel.style.display = 'none';
});

/* Init */
(async function init(){
  await refreshPlayersCache();
  const saved = getCurrentUser();
  if (saved?.username) {
    const fresh = await getDoc(doc(db, "players", saved.username));
    if (fresh.exists()) {
      setCurrentUser(fresh.data());
      launchGame(fresh.data().username);
    }
  }
  const s = getStats();
  const flags = getUserFlags();
  if (s.level >= 10 && !flags.streamUnlockNotified) {
    setUserFlags({ streamUnlockNotified: true });
    showUnlockModal('Stream');
  }
})();

/* Pond & Stream tables */
const pondTable = [
  { name: "Crappie", type: "fish", weight: 16, rarity: "common", value: 4 },
  { name: "Pumpkinseed", type: "fish", weight: 12, rarity: "common", value: 4 },
  { name: "Yellow Perch", type: "fish", weight: 12, rarity: "common", value: 4 },
  { name: "Bluegill", type: "fish", weight: 9, rarity: "uncommon", value: 6 },
  { name: "Catfish", type: "fish", weight: 7, rarity: "uncommon", value: 8 },
  { name: "Carp", type: "fish", weight: 4, rarity: "uncommon", value:10 },
  { name: "Goldfish", type: "fish", weight: 10, rarity: "rare", value:15 },
  { name: "Largemouth Bass", type: "fish", weight: 4, rarity: "epic", value:20 },
  { name: "Golden Koi", type: "fish", weight: 1, rarity: "legendary",value:40 },
  { name: "Old Boot", type: "trash", weight: 5, value: 1 },
  { name: "Tin Can", type: "trash", weight: 5, value: 1 },
  { name: "Tangled Line", type: "trash", weight: 5, value: 1 },
  { name: "Broken Glass", type: "trash", weight: 5, value: 1 },
  { name: "Rusty Hook", type: "trash", weight: 5, value: 1 }
];

const streamTable = [
  { name: "Creek Chub", type: "fish", weight: 10, rarity: "common", value: 4 },
  { name: "Fallfish", type: "fish", weight: 10, rarity: "common", value: 4 },
  { name: "White Sucker", type: "fish", weight: 8, rarity: "common", value: 5 },
  { name: "Common Shiner", type: "fish", weight: 6, rarity: "common", value: 4 },
  { name: "Redbreast Sunfish", type: "fish", weight: 6, rarity: "common", value: 4 },
  { name: "Smallmouth Bass", type: "fish", weight: 7, rarity: "uncommon", value:10 },
  { name: "Rock Bass", type: "fish", weight: 5, rarity: "uncommon", value: 7 },
  { name: "Rainbow Darter", type: "fish", weight: 4, rarity: "uncommon", value: 8 },
  { name: "Brook Stickleback", type: "fish", weight: 4, rarity: "uncommon", value: 6 },
  { name: "Brook Trout", type: "fish", weight: 4, rarity: "rare", value:16 },
  { name: "Brown Trout", type: "fish", weight: 3, rarity: "rare", value:18 },
  { name: "Tiger Trout", type: "fish", weight: 3, rarity: "rare", value:19 },
  { name: "Atlantic Salmon", type: "fish", weight: 4, rarity: "epic", value:28 },
  { name: "Ancient River Sturgeon", type: "fish", weight: 1, rarity: "legendary", value:45 },
  { name: "Waterlogged Branch", type: "trash", weight: 8, value: 1 },
  { name: "Torn Fishing Net", type: "trash", weight: 8, value: 1 },
  { name: "Muddy Bottle", type: "trash", weight: 9, value: 1 }
];

function lookupItemMeta(name) {
  return pondTable.find(i => i.name === name) || streamTable.find(i => i.name === name) || { name, type:'unknown', value:0, rarity:'common' };
}

/* Navigation */
document.getElementById('fishingSpotBtn').addEventListener('click', () => {
  const s = getStats();
  const unlocked = s.level >= 10;
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${(getCurrentUser()?.coins ?? 0)} · ⭐ Lv ${s.level} (${s.xp}/${xpNeededFor(s.level)})</div>
    <div class="pond-wrap">
      <h2>🎣 Fishing Spot</h2>
      <p>Select your location:</p>
      <button class="location-btn" id="pondBtn">🐟 Pond</button>
      <button class="location-btn ${unlocked ? '' : 'locked'}" id="streamBtn" ${unlocked ? '' : 'disabled'}>🌊 Stream</button>
      ${unlocked ? '' : '<div class="lock-note">Reach <b>Level 10</b> to access the Stream.</div>'}
    </div>`;
  updateGoldHud();
  const streamBtn = document.getElementById('streamBtn');
  if (streamBtn && !unlocked) {
    streamBtn.addEventListener('click', () => alert('Locked: Reach Level 10 to access the Stream.'));
  }
});

document.getElementById('leaderboardBtn').addEventListener('click', renderLeaderboard);
document.getElementById('homeBtn').addEventListener('click', renderHome);
document.getElementById('backpackBtn').addEventListener('click', renderBackpack);
document.getElementById('shopBtn').addEventListener('click', renderShopMenu);

/* Home */
function renderHome() {
  const coins = getCurrentUser()?.coins ?? 0;
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="pond-wrap">
      <h2>🏠 Home</h2>
      <p class="small">Your cozy base. Visit the Showcase or tend to your Nursery.</p>
      <div class="row" style="margin-top:12px;">
        <button id="showcaseBtn">🖼 Showcase</button>
        <button id="nurseryBtn">🌱 Nursery</button>
      </div>
    </div>`;
  updateGoldHud();
  document.getElementById('showcaseBtn').onclick = renderShowcase;
  document.getElementById('nurseryBtn').onclick = renderNursery;
}

/* Showcase */
function renderShowcase() {
  const coins = getCurrentUser()?.coins ?? 0;
  const inv = getInventory();
  const showcased = getShowcaseItems();
  const remainingSlots = Math.max(0, SHOWCASE_LIMIT - showcased.length);
  const manageList = inv
    .map((it, idx) => ({ ...it, _idx: idx }))
    .filter(it => it.type === 'fish' && it.showcased !== true)
    .map(it => {
      const btnId = `sc-btn-${it._idx}`;
      const meta = `${it.value || 0}g`;
      const addDisabled = remainingSlots === 0 ? 'disabled' : '';
      return `
        <div class="bp-row" data-idx="${it._idx}">
          <div class="bp-name">${renderStyledFishName(it)}</div>
          <div class="bp-meta">fish · ${meta}</div>
          <div class="sc-action">
            <button id="${btnId}" class="sc-btn" ${addDisabled} title="Add to Showcase">Add</button>
          </div>
        </div>
      `;
    }).join('');
  const displayedRows = showcased.map(i => {
    const rid = `sc-rem-${i._idx}`;
    const meta = `${i.value || 0}g`;
    return `
      <div class="displayed-row">
        <div class="bp-name">${renderStyledFishName(i)} <span class="small">· ${meta}</span></div>
        <div style="display:flex;justify-content:flex-end;">
          <button id="${rid}" class="remove-btn" title="Remove from Showcase">Remove</button>
        </div>
      </div>
    `;
  }).join('');
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="pond-wrap showcase-mode">
      <div class="pond-header">
        <h2>🖼 Showcase</h2>
        <button id="backHome" class="back-inline">← Back</button>
      </div>
      <p class="small" style="margin-top:8px;">
        Selected: <b>${showcased.length}</b> / <b>${SHOWCASE_LIMIT}</b> · Slots left: <b>${remainingSlots}</b>
      </p>
      <div style="width:100%; text-align:left; margin-top:8px;">
        <h3 style="margin:8px 0 6px;">Currently Displayed</h3>
        <div class="displayed-list">
          ${displayedRows || `<p class="small" style="opacity:.85;">No fish displayed yet.</p>`}
        </div>
      </div>
      <div style="width:100%; text-align:left; margin-top:12px;">
        <h3 style="margin:8px 0 6px;">Manage Selection</h3>
        <div class="scroll-panel">
          ${manageList || `<p class="small" style="opacity:.85;">No fish available to add.</p>`}
        </div>
        <p class="small" style="opacity:.8; margin-top:8px;">
          You can favorite as many fish as you want in your Backpack — favorites are separate from the Showcase.
        </p>
      </div>
    </div>`;
  updateGoldHud();
  document.getElementById('backHome').onclick = renderHome;
}

/* Nursery (placeholder) */
function renderNursery() {
  const coins = getCurrentUser()?.coins ?? 0;
  const NURSERY_UNLOCK_COST = 2500;
  function hasNurseryAccess() { return !!getUserFlags().nurseryAccess; }
  function canAfford(cost){ return (getCurrentUser()?.coins ?? 0) >= cost; }
  function spendGold(amount){
    const cu = getCurrentUser(); if (!cu) return false;
    if ((cu.coins ?? 0) < amount) return false;
    cu.coins -= amount; setCurrentUser(cu);
    const players = getPlayers(); const idx = players.findIndex(p => p.username === cu.username);
    if (idx !== -1) { players[idx].coins = cu.coins; savePlayers(players); }
    updateGoldHud(); return true;
  }
  function grantNurseryAccess(){ setUserFlags({ nurseryAccess: true }); }
  if (!hasNurseryAccess()) {
    const canBuy = coins >= NURSERY_UNLOCK_COST;
    mainContent.innerHTML = `
      <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
      <div class="pond-wrap">
        <div class="pond-header">
          <h2>🌱 Nursery (Locked)</h2>
          <button id="backHome" class="back-inline">← Back</button>
        </div>
        <p class="small">Unlock the Nursery to raise fish eggs and grow helpful buffs.</p>
        <div class="status" style="margin-top:10px;">Cost to unlock: <b>${NURSERY_UNLOCK_COST}g</b></div>
        <div class="row" style="margin-top:12px;">
          <button id="unlockNurseryBtn" ${canBuy ? "" : "disabled"}>Unlock Nursery</button>
        </div>
        <div class="small" style="margin-top:6px; opacity:.85;">
          ${canBuy ? "You have enough gold to unlock the Nursery." : "You need more gold to unlock the Nursery."}
        </div>
      </div>`;
    updateGoldHud();
    document.getElementById('backHome').onclick = renderHome;
    const unlockBtn = document.getElementById('unlockNurseryBtn');
    if (unlockBtn) {
      unlockBtn.onclick = () => {
        if (!canAfford(NURSERY_UNLOCK_COST)) { alert("Not enough gold to unlock the Nursery."); return; }
        const ok = confirm(`Spend ${NURSERY_UNLOCK_COST} gold to unlock the Nursery?`);
        if (!ok) return;
        if (!spendGold(NURSERY_UNLOCK_COST)) { alert("Purchase failed. Please try again."); return; }
        grantNurseryAccess();
        goldPopup("🌱 Nursery unlocked!");
        renderNursery();
      };
    }
    return;
  }
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="pond-wrap">
      <div class="pond-header">
        <h2>🌱 Nursery</h2>
        <button id="backHome" class="back-inline">← Back</button>
      </div>
      <p>Coming soon: incubate eggs, feed fry, and earn time-limited boosts.</p>
    </div>`;
  updateGoldHud();
  document.getElementById('backHome').onclick = renderHome;
}

/* Player Profile */
function showPlayerProfile(username){
  const p = (getPlayers() || []).find(q => q.username === username);
  if(!p){ alert("Player not found."); return; }
  const level = p.level ?? 1;
  const xp = p.xp ?? 0;
  const showcased = (p.items || [])
    .map((it, idx) => ({...it, _idx: idx}))
    .filter(it => it && it.type === 'fish' && it.showcased === true);
  const listHTML = showcased.length
    ? showcased.map(i => `
        <div class="profile-row">
          <div class="bp-name">${renderStyledFishName(i)} <span class="small">· ${i.value || 0}g</span></div>
        </div>`).join('')
    : `<p class="small" style="opacity:.85;">No fish in Showcase.</p>`;
  const ov = document.getElementById('profileOverlay');
  const body = document.getElementById('profileBody');
  const ttl = document.getElementById('profileTitle');
  ttl.textContent = username;
  body.innerHTML = `
    <div class="small" style="opacity:.9;margin-bottom:8px;">
      ⭐ Level ${level} · XP ${xp}/${xpNeededFor(level)}
    </div>
    <h3 style="margin:8px 0 6px;">Showcase</h3>
    <div class="profile-list">${listHTML}</div>`;
  ov.style.display = 'flex';
  const close = () => { ov.style.display = 'none'; };
  document.getElementById('profileCloseBtn').onclick = close;
  const outsideHandler = (e) => { if (e.target === ov) close(); };
  ov.addEventListener('click', outsideHandler, { once: true });
}

/* Leaderboard */
async function renderLeaderboard() {
  await refreshPlayersCache();
  const coins = getCurrentUser()?.coins ?? 0;
  const me = getCurrentUser();
  const players = getPlayers().slice().sort((a,b)=>{
    if ((b.level||1)!==(a.level||1)) return (b.level||1)-(a.level||1);
    if ((b.xp||0)!==(a.xp||0)) return (b.xp||0)-(a.xp||0);
    if ((b.coins||0)!==(a.coins||0)) return (b.coins||0)-(a.coins||0);
    return (a.username||'').localeCompare(b.username||'');
  });
  const rows = players.map((p, i) => {
    const isMe = me && p.username === me.username;
    const cls = isMe ? ' class="me-row"' : '';
    const safeName = p.username || '—';
    return `
      <tr${cls}>
        <td>#${i+1}</td>
        <td><a href="#" class="lb-player" data-username="${safeName}">${safeName}</a></td>
        <td>Lv ${p.level ?? 1}</td>
        <td class="col-xp">${p.xp ?? 0}</td>
        <td>${p.coins ?? 0}g</td>
      </tr>`;
  }).join('');
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="board-wrap">
      <h2>🏆 Leaderboard</h2>
      <p class="small">Sorted by Level → XP → Coins.</p>
      <table class="board-table" aria-label="Leaderboard">
        <thead>
          <tr><th>Rank</th><th>Player</th><th>Level</th><th class="col-xp">XP</th><th>Coins</th></tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5">No players yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  updateGoldHud();
}

/* Pond */
function showPond() {
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${(getCurrentUser()?.coins ?? 0)} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="pond-wrap">
      <div class="pond-header">
        <h2>🐟 Pond</h2>
        <button id="backToSpots" class="back-inline back-left">← Back to Spots</button>
      </div>
      <div class="status" id="pondStatus">The pond is calm and reflective.</div>
      <div class="progress" id="searchProg" style="display:none;"><div class="progress-fill" id="searchFill"></div></div>
      <div class="row" id="castRow"><button id="castBtn">Cast</button></div>
      <div id="minigameArea" style="margin-top:14px;"></div>
      <div class="small" style="margin-top:10px;">Tip: Hold <b>Reel</b> (or <b>Space</b>) to raise tension; release to let it fall.</div>
    </div>`;
  updateGoldHud();
  const backBtn = document.getElementById('backToSpots');
  const status = document.getElementById('pondStatus');
  const area = document.getElementById('minigameArea');
  const searchProg= document.getElementById('searchProg');
  const searchFill= document.getElementById('searchFill');
  const castRow = document.getElementById('castRow');
  const castBtn = document.getElementById('castBtn');
  if (backBtn) backBtn.onclick = () => document.getElementById('fishingSpotBtn').click();

  let spaceRecastKeydown = null;
  function setSpaceRecast(handler) {
    if (spaceRecastKeydown) {
      window.removeEventListener('keydown', spaceRecastKeydown);
      spaceRecastKeydown = null;
    }
    if (handler) {
      spaceRecastKeydown = (e) => {
        if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); handler(); }
      };
      window.addEventListener('keydown', spaceRecastKeydown);
    }
  }

  const runCastCycle = async () => {
    setSpaceRecast(null);
    castRow.style.display = 'none';
    area.innerHTML = '';
    status.textContent = "Watching for ripples...";
    searchProg.style.display = 'block';
    searchFill.style.width = '0%';

    const baitEffects = getEquippedBaitEffects();
    const baseWait = 1000 + Math.random()*2000;
    const waitMs = Math.max(350, baseWait * baitEffects.searchMult);

    await animateProgress(searchFill, waitMs);
    searchProg.style.display = 'none';

    const hooked = weightedPick(pondTable);
    if (hooked.type === 'trash') {
      status.innerHTML = `You snagged <b>${hooked.name}</b> (+${hooked.value}g).`;
      saveCatchToUser(hooked.name);
      addXP(1);
      area.innerHTML = `<div class="row"><button id="recastBtn">Recast</button></div>`;
      document.getElementById('recastBtn').onclick = runCastCycle;
      setSpaceRecast(runCastCycle);
      return;
    }

    const vr = buildVariantResult();
    const statusLabel = vr.status ? vr.status.label : '';
    const cfg = { ...(rarityConfig[hooked.rarity] || rarityConfig.common) };

    const rodEffects = getEquippedRodEffects();
    const zoneCenter = (cfg.zoneMin + cfg.zoneMax)/2;
    const width = (cfg.zoneMax - cfg.zoneMin);
    const narrow = Math.max(8, width * (1 - vr.diff.zoneNarrow));
    cfg.zoneMin = Math.max(5, zoneCenter - narrow/2);
    cfg.zoneMax = Math.min(95, zoneCenter + narrow/2);
    cfg.wobble = cfg.wobble * (1 + vr.diff.wobble) * 1.10;
    cfg.drift = (cfg.drift || 0.35) * (1 + vr.diff.driftUp) * 1.10;
    cfg.timeToLand = Math.round(cfg.timeToLand * (1 + vr.diff.timeUp));

    status.innerHTML = `Bite! Keep the tension in the zone to land it!`;

    startReelMinigameWithConfig(area, hooked, cfg, (success, reelBtnRef) => {
      if (success) {
        const sz = rollSizeTier();
        const baseValue = hooked.value || 0;
        const finalValue = Math.max(0, Math.round(baseValue * vr.totalMult * (sz.mult || 1) * baitEffects.valueMult));
        const tempItemForStyle = { name: hooked.name, variantBaseKey: normalizeVariantKey(vr.base.key), statusLabel, sizeKey: sz.key, sizeLabel: sz.label };
        status.innerHTML = `<span class="success">Success!</span> You caught a <b>${renderStyledFishName(tempItemForStyle)}</b>!`;
        saveCatchToUser({
          name: hooked.name, type: hooked.type, value: finalValue, favorite: false,
          variantBaseKey: normalizeVariantKey(vr.base.key), variantBaseLabel: prettyLabelFromKey(vr.base.key),
          statusLabel, sizeKey: sz.key, sizeLabel: sz.label
        });
        const xpByRarity = { common: 2, uncommon: 4, rare: 8, epic: 12, legendary: 20 };
        const xpBase = xpByRarity[hooked.rarity] ?? 2;
        addXP(Math.round(xpBase * baitEffects.xpMult));
      } else {
        status.innerHTML = `<span class="fail">It got away!</span>`;
      }
      if (reelBtnRef) {
        reelBtnRef.textContent = 'Recast';
        reelBtnRef.disabled = false;
        reelBtnRef.onmousedown = null; reelBtnRef.onmouseup = null; reelBtnRef.onmouseleave = null;
        reelBtnRef.ontouchstart = null; reelBtnRef.ontouchend = null;
        reelBtnRef.onclick = () => runCastCycle();
        setSpaceRecast(runCastCycle);
      } else {
        area.innerHTML = `<div class="row"><button id="recastBtn">Recast</button></div>`;
        document.getElementById('recastBtn').onclick = runCastCycle;
        setSpaceRecast(runCastCycle);
      }
    });
  };

  if (castBtn) castBtn.onclick = runCastCycle;
}

/* Stream */
function showStream() {
  if (!isStreamUnlocked()) {
    alert('Locked: Reach Level 10 to access the Stream.');
    return;
  }
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${(getCurrentUser()?.coins ?? 0)} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="pond-wrap">
      <div class="pond-header">
        <h2>🌊 Stream</h2>
        <button id="backToSpots" class="back-inline back-left">← Back to Spots</button>
      </div>
      <div class="status" id="streamStatus">The current is swift and the water is clear.</div>
      <div class="progress" id="searchProg" style="display:none;"><div class="progress-fill" id="searchFill"></div></div>
      <div class="row" id="castRow"><button id="castBtn">Cast</button></div>
      <div id="minigameArea" style="margin-top:14px;"></div>
      <div class="small" style="margin-top:10px;">Tip: Hold <b>Reel</b> (or <b>Space</b>) to raise tension; release to let it fall.</div>
    </div>`;
  updateGoldHud();
  const backBtn = document.getElementById('backToSpots');
  const status = document.getElementById('streamStatus');
  const area = document.getElementById('minigameArea');
  const searchProg= document.getElementById('searchProg');
  const searchFill= document.getElementById('searchFill');
  const castRow = document.getElementById('castRow');
  const castBtn = document.getElementById('castBtn');
  if (backBtn) backBtn.onclick = () => document.getElementById('fishingSpotBtn').click();

  let spaceRecastKeydown = null;
  function setSpaceRecast(handler) {
    if (spaceRecastKeydown) {
      window.removeEventListener('keydown', spaceRecastKeydown);
      spaceRecastKeydown = null;
    }
    if (handler) {
      spaceRecastKeydown = (e) => {
        if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); handler(); }
      };
      window.addEventListener('keydown', spaceRecastKeydown);
    }
  }

  const runCastCycle = async () => {
    setSpaceRecast(null);
    castRow.style.display = 'none';
    area.innerHTML = '';
    status.textContent = "Scanning the fast current...";
    searchProg.style.display = 'block';
    searchFill.style.width = '0%';

    const baitEffects = getEquippedBaitEffects();
    const baseWait = 1000 + Math.random()*2000;
    const waitMs = Math.max(350, baseWait * baitEffects.searchMult);

    await animateProgress(searchFill, waitMs);
    searchProg.style.display = 'none';

    const hooked = weightedPick(streamTable);
    if (hooked.type === 'trash') {
      status.innerHTML = `You snagged <b>${hooked.name}</b> (+${hooked.value}g).`;
      saveCatchToUser(hooked.name);
      addXP(1);
      area.innerHTML = `<div class="row"><button id="recastBtn">Recast</button></div>`;
      document.getElementById('recastBtn').onclick = runCastCycle;
      setSpaceRecast(runCastCycle);
      return;
    }

    const vr = buildVariantResult();
    const statusLabel = vr.status ? vr.status.label : '';
    const cfg = { ...(rarityConfig[hooked.rarity] || rarityConfig.common) };

    const rodEffects = getEquippedRodEffects();
    const zoneCenter = (cfg.zoneMin + cfg.zoneMax)/2;
    const width = (cfg.zoneMax - cfg.zoneMin);
    const narrow = Math.max(8, width * (1 - vr.diff.zoneNarrow));
    cfg.zoneMin = Math.max(5, zoneCenter - narrow/2);
    cfg.zoneMax = Math.min(95, zoneCenter + narrow/2);
    cfg.wobble = cfg.wobble * (1 + vr.diff.wobble) * 1.10;
    cfg.drift = (cfg.drift || 0.35) * (1 + vr.diff.driftUp) * 1.10;
    cfg.timeToLand = Math.round(cfg.timeToLand * (1 + vr.diff.timeUp));

    status.innerHTML = `Bite! Keep the tension in the zone to land it!`;

    startReelMinigameWithConfig(area, hooked, cfg, (success, reelBtnRef) => {
      if (success) {
        const sz = rollSizeTier();
        const baseValue = hooked.value || 0;
        const finalValue = Math.max(0, Math.round(baseValue * vr.totalMult * (sz.mult || 1) * baitEffects.valueMult));
        const tempItemForStyle = { name: hooked.name, variantBaseKey: normalizeVariantKey(vr.base.key), statusLabel, sizeKey: sz.key, sizeLabel: sz.label };
        status.innerHTML = `<span class="success">Success!</span> You caught a <b>${renderStyledFishName(tempItemForStyle)}</b>!`;
        saveCatchToUser({
          name: hooked.name, type: hooked.type, value: finalValue, favorite: false,
          variantBaseKey: normalizeVariantKey(vr.base.key), variantBaseLabel: prettyLabelFromKey(vr.base.key),
          statusLabel, sizeKey: sz.key, sizeLabel: sz.label
        });
        const xpByRarity = { common: 2, uncommon: 4, rare: 8, epic: 12, legendary: 20 };
        const xpBase = xpByRarity[hooked.rarity] ?? 2;
        addXP(Math.round(xpBase * baitEffects.xpMult));
      } else {
        status.innerHTML = `<span class="fail">It got away!</span>`;
      }
      if (reelBtnRef) {
        reelBtnRef.textContent = 'Recast';
        reelBtnRef.disabled = false;
        reelBtnRef.onmousedown = null; reelBtnRef.onmouseup = null; reelBtnRef.onmouseleave = null;
        reelBtnRef.ontouchstart = null; reelBtnRef.ontouchend = null;
        reelBtnRef.onclick = () => runCastCycle();
        setSpaceRecast(runCastCycle);
      } else {
        area.innerHTML = `<div class="row"><button id="recastBtn">Recast</button></div>`;
        document.getElementById('recastBtn').onclick = runCastCycle;
        setSpaceRecast(runCastCycle);
      }
    });
  };

  if (castBtn) castBtn.onclick = runCastCycle;
}

/* Minigame */
async function animateProgress(fillEl, durationMs){
  const start = performance.now();
  return new Promise(resolve=>{
    function step(ts){
      const t = Math.min(1, (ts - start)/durationMs);
      fillEl.style.width = (t*100).toFixed(1) + '%';
      if (t < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}

function startReelMinigame(container, fish, onDone) {
  const cfg = rarityConfig[fish.rarity] || rarityConfig.common;
  const rodEffects = getEquippedRodEffects();
  const eff = { ...cfg };
  const widen = rodEffects.zoneBonus || 0;
  const center = (eff.zoneMin + eff.zoneMax) / 2;
  const width = (eff.zoneMax - eff.zoneMin) + widen;
  eff.zoneMin = Math.max(5, center - width / 2);
  eff.zoneMax = Math.min(95, center + width / 2);
  eff.wobble = Math.max(0.25, eff.wobble * (rodEffects.wobbleMult || 1));
  eff.drift *= (rodEffects.driftMult || 1);

  const START_PROGRESS_FRAC = 0.45;
  container.innerHTML = `
    <div class="progress" id="landProg"><div class="progress-fill" id="landFill"></div></div>
    <div class="meter" id="meter">
      <div class="meter-zone" id="zone"></div>
      <div class="meter-fill" id="fill"></div>
    </div>
    <div class="row"><button id="reelBtn">Reel</button></div>`;
  const reelBtn = document.getElementById('reelBtn');
  const fill = document.getElementById('fill');
  const zone = document.getElementById('zone');
  const landFill = document.getElementById('landFill');
  zone.style.left = eff.zoneMin + '%';
  zone.style.width = (eff.zoneMax - eff.zoneMin) + '%';

  let tension = 50, holding = false, lastTs = performance.now(), timer;
  let progress = Math.round(eff.timeToLand * START_PROGRESS_FRAC);

  const onHold = () => { holding = true; };
  const onRelease = () => { holding = false; };
  reelBtn.addEventListener('mousedown', onHold);
  reelBtn.addEventListener('mouseup', onRelease);
  reelBtn.addEventListener('mouseleave', onRelease);
  reelBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); onHold(); }, {passive:false});
  reelBtn.addEventListener('touchend', (e)=>{ e.preventDefault(); onRelease(); }, {passive:false});

  const onKeyDown = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); holding = true; } };
  const onKeyUp = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); holding = false; } };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function cleanup() {
    cancelAnimationFrame(timer);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  function step(ts) {
    const dt = Math.min(50, ts - lastTs);
    lastTs = ts;
    const baseDrift = (eff.drift != null ? eff.drift : 0.25);
    let drift = (holding ? baseDrift*2.2 : -baseDrift*1.6);
    const wobble = (Math.sin(ts/140) + Math.cos(ts/310)) * eff.wobble;
    tension += (drift + wobble) * (dt/16.7);
    tension = Math.max(0, Math.min(100, tension));
    fill.style.left = (tension - 10) + '%';
    fill.style.width = '20%';

    const inZone = tension >= eff.zoneMin && tension <= eff.zoneMax;
    const FILL_RATE = 1.00;
    const DRAIN_RATE = 0.90;
    progress += inZone ? (dt * FILL_RATE) : (-dt * DRAIN_RATE);
    if (progress < 0) progress = 0;
    if (progress > eff.timeToLand) progress = eff.timeToLand;

    const pct = Math.max(0, Math.min(100, (progress / eff.timeToLand) * 100));
    landFill.style.width = pct.toFixed(1) + '%';

    if (progress >= eff.timeToLand) return end(true);
    if (progress <= 0) return end(false);

    timer = requestAnimationFrame(step);
  }
  timer = requestAnimationFrame(step);

  function end(success) {
    cleanup();
    reelBtn.disabled = true;
    setTimeout(()=>onDone(success, reelBtn), 120);
  }
}

function startReelMinigameWithConfig(container, fish, customCfg, onDone) {
  const cfgKey = fish.rarity;
  const tempKey = `__temp_${cfgKey}`;
  rarityConfig[tempKey] = customCfg;
  const tempFish = { ...fish, rarity: tempKey };
  startReelMinigame(container, tempFish, (ok, btn) => {
    delete rarityConfig[tempKey];
    onDone(ok, btn);
  });
}

/* Backpack */
function friendlyMeta(item) {
  if (item.type === 'gear-rod') return `Rod Gear`;
  if (item.type === 'gear-bait') return `Bait Gear`;
  return `${item.type}${item.value ? ` · ${item.value}g` : ''}`;
}

function renderBackpack() {
  const full = getInventory();
  const inv = full
    .map((it, original) => ({ ...it, _idx: original }))
    .filter(i => i.showcased !== true);
  const coins = getCurrentUser()?.coins ?? 0;

  const rows = inv.map(item => {
    if (item.type?.startsWith('gear-')) {
      const isEquipped = item.equipped;
      return `
        <div class="bp-row" data-idx="${item._idx}">
          <div class="bp-name">${item.name}${isEquipped ? ' <span class="equipped-badge">Equipped</span>' : ''}</div>
          <div class="bp-meta">${friendlyMeta(item)}</div>
          <div style="padding: 8px 0;">${isEquipped ? '—' : `<button class="equip-btn" data-idx="${item._idx}">Equip</button>`}</div>
        </div>`;
    } else {
      const heartClass = item.favorite ? 'heart-btn fav' : 'heart-btn';
      return `
        <div class="bp-row" data-idx="${item._idx}">
          <div class="bp-name">${renderStyledFishName(item)}</div>
          <div class="bp-meta">${friendlyMeta(item)}</div>
          <div class="heart">
            <button class="${heartClass}" title="Favorite (left-click) / Toggle (right-click)" data-idx="${item._idx}">
              ${item.favorite ? '♥' : '♡'}
            </button>
          </div>
        </div>`;
    }
  }).join('');

  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="bp-wrap">
      <h2>🎒 Backpack</h2>
      <div class="scroll-panel">
        ${rows || '<p>No items yet.</p>'}
      </div>
      <div class="bp-hint">
        Tip: Showcased fish are hidden here and can’t be sold until you remove them from 🖼 Showcase.
      </div>
    </div>`;
  updateGoldHud();
}

/* Shop */
function isSellable(item) { return (item && item.showcased !== true && !item.favorite && (item.type === 'fish' || item.type === 'trash')); }
function sellValue(item) { return typeof item.value === 'number' ? item.value : 0; }

function renderShopMenu() {
  const coins = getCurrentUser()?.coins ?? 0;
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="shop-wrap">
      <h2>🛒 Shop</h2>
      <p>What would you like to do?</p>
      <div class="row" style="margin-top:6px;">
        <button class="location-btn" id="buyBtn">🧺 Buy</button>
        <button class="location-btn" id="sellBtn">💰 Sell</button>
      </div>
    </div>`;
  updateGoldHud();
  document.getElementById('buyBtn').addEventListener('click', showBuy);
  document.getElementById('sellBtn').addEventListener('click', showSell);
}

function canAfford(cost){ return (getCurrentUser()?.coins ?? 0) >= cost; }
function spendGold(amount){
  const cu = getCurrentUser(); if (!cu) return false;
  if ((cu.coins ?? 0) < amount) return false;
  cu.coins -= amount; setCurrentUser(cu);
  const players = getPlayers(); const idx = players.findIndex(p => p.username === cu.username);
  if (idx !== -1) { players[idx].coins = cu.coins; savePlayers(players); }
  updateGoldHud(); return true;
}

function showBuy() {
  const coins = getCurrentUser()?.coins ?? 0;
  const inv = getInventory();
  const ownedRods = new Set(inv.filter(i => i.type === 'gear-rod').map(i => i.gearId));
  const ownedBaits = new Set(inv.filter(i => i.type === 'gear-bait').map(i => i.gearId));

  const rodRows = ROD_TYPES.filter(r => r.id !== 'starter').map(r => {
    const owned = ownedRods.has(r.id);
    const disabled = owned || coins < r.cost ? 'disabled' : '';
    return `
      <div class="sell-row">
        <div><strong>${r.name}</strong></div>
        <div>${r.cost}g</div>
        <button class="buy-btn" data-type="rod" data-id="${r.id}" ${disabled}>${owned ? 'Owned' : 'Buy'}</button>
      </div>`;
  }).join('');

  const baitRows = BAIT_TYPES.filter(b => b.id !== 'none').map(b => {
    const owned = ownedBaits.has(b.id);
    const disabled = owned || coins < b.cost ? 'disabled' : '';
    return `
      <div class="sell-row">
        <div><strong>${b.name}</strong></div>
        <div>${b.cost}g</div>
        <button class="buy-btn" data-type="bait" data-id="${b.id}" ${disabled}>${owned ? 'Owned' : 'Buy'}</button>
      </div>`;
  }).join('');

  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="shop-wrap">
      <h2>🛒 Shop · Buy</h2>
      <div class="row" style="margin-bottom:10px;">
        <button id="backToShop">← Back</button>
      </div>
      <div class="sell-list scroll-panel">
        <h3 style="margin:8px 0 6px;">Rods</h3>
        ${rodRows}
        <h3 style="margin:20px 0 6px;">Baits</h3>
        ${baitRows}
      </div>
      <p class="small" style="opacity:.8;margin-top:12px;">
        Each rod and bait can be bought once. You can only equip one rod and one bait at a time.
      </p>
    </div>`;
  updateGoldHud();
  document.getElementById('backToShop').onclick = renderShopMenu;
}

function showSell() {
  const coins = getCurrentUser()?.coins ?? 0;
  const inv = getInventory();
  const sellable = inv.map((it, idx) => ({...it, _idx: idx})).filter(it => isSellable(it));
  const list = sellable.map(it => `
    <div class="sell-row">
      <div><strong>${renderStyledFishName(it)}</strong> <span style="opacity:.85">· ${it.type}</span></div>
      <div>${sellValue(it)}g</div>
      <button data-idx="${it._idx}" class="sell-one-btn">Sell</button>
    </div>`).join('');
  const totalGold = sellable.reduce((a,c)=>a+sellValue(c),0);
  mainContent.innerHTML = `
    <div class="hud" id="goldHud">💰 ${coins} · ⭐ Lv ${getStats().level} (${getStats().xp}/${xpNeededFor(getStats().level)})</div>
    <div class="shop-wrap">
      <h2>🛒 Shop · Sell</h2>
      <div class="row" style="margin-bottom:10px;">
        <button id="backToShop">← Back</button>
        <button id="sellAllBtnTop" ${sellable.length ? '' : 'disabled'}>Sell All</button>
      </div>
      ${sellable.length ? `<div class="sell-list scroll-panel">${list}</div>`
                        : `<p>No sellable items. Favorited or Showcased fish are protected, and gear can’t be sold.</p>`}
      <div class="sell-summary">
        <p>Total (non-favorited, non-showcased, sellable): <strong>${totalGold}g</strong></p>
        <div class="row"><button id="sellAllBtn" ${sellable.length ? '' : 'disabled'}>Sell All</button></div>
      </div>
    </div>`;
  updateGoldHud();
  document.getElementById('backToShop').onclick = renderShopMenu;
  const sellAllHandler = () => sellAll();
  const sellAllTop = document.getElementById('sellAllBtnTop');
  const sellAllBottom = document.getElementById('sellAllBtn');
  if (sellAllTop) sellAllTop.onclick = sellAllHandler;
  if (sellAllBottom) sellAllBottom.onclick = sellAllHandler;
}

/* Sell functions */
function sellSingle(indexInInventory) {
  const inv = getInventory();
  const item = inv[indexInInventory];
  if (!item) return;
  if (!isSellable(item)) { alert("That item can't be sold."); return; }
  const value = sellValue(item);
  inv.splice(indexInInventory, 1);
  setInventory(inv);
  addGold(value);
  showSell();
}

function sellAll() {
  const inv = getInventory();
  let earned = 0; const remaining = [];
  for (const it of inv) {
    if (isSellable(it)) earned += sellValue(it);
    else remaining.push(it);
  }
  if (earned === 0) { alert("Nothing to sell."); return; }
  setInventory(remaining);
  addGold(earned);
  showSell();
}

/* EVENT DELEGATION - fixes all button issues */
document.addEventListener('click', (e) => {
  const target = e.target;

  if (target.classList.contains('heart-btn')) {
    const row = target.closest('.bp-row');
    const idx = Number(row?.dataset.idx);
    if (!isNaN(idx)) toggleFavorite(idx);
    return;
  }

  if (target.classList.contains('equip-btn')) {
    const row = target.closest('.bp-row');
    const idx = Number(row?.dataset.idx);
    if (!isNaN(idx)) equipItem(idx);
    return;
  }

  if (target.classList.contains('sell-one-btn')) {
    const row = target.closest('.sell-row');
    const idx = Number(row?.dataset.idx);
    if (!isNaN(idx)) sellSingle(idx);
    return;
  }

  if (target.classList.contains('sc-btn')) {
    const row = target.closest('.bp-row');
    const idx = Number(row?.dataset.idx);
    if (!isNaN(idx)) {
      if (getShowcaseItems().length >= SHOWCASE_LIMIT) {
        alert('Showcase is full. Remove one first.');
        return;
      }
      setShowcaseForIndex(idx, true);
      renderShowcase();
    }
    return;
  }

  if (target.classList.contains('remove-btn')) {
    const row = target.closest('.displayed-row');
    const idx = Number(row?.dataset.idx);
    if (!isNaN(idx)) {
      setShowcaseForIndex(idx, false);
      renderShowcase();
    }
    return;
  }

  if (target.classList.contains('buy-btn')) {
    const type = target.dataset.type;
    const id = target.dataset.id;
    if (type && id) {
      buyGear(type, id);
      showBuy();
    }
    return;
  }

  if (target.classList.contains('lb-player')) {
    e.preventDefault();
    const username = target.dataset.username;
    if (username && username !== '—') showPlayerProfile(username);
    return;
  }
});

// Right-click favorite toggle
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.bp-row');
  if (row) {
    e.preventDefault();
    const idx = Number(row.dataset.idx);
    if (!isNaN(idx)) toggleFavorite(idx);
  }
});
