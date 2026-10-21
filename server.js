const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
  if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify({ message: '', time: 0 }, null, 2));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function sanitizeUser(user) {
  return {
    username: user.username,
    isAdmin: Boolean(user.isAdmin || user.username?.toLowerCase() === 'admin'),
    score: Number(user.score || 0),
    level: Number(user.level || 1),
    streak: Number(user.streak || 0),
    caught: Number(user.caught || 0),
    coins: Number(user.coins || 0),
    inventory: user.inventory || {},
    shinyInventory: user.shinyInventory || {},
    mode: user.mode || 'mixed'
  };
}

function getUsers() {
  ensureFiles();
  return readJson(USERS_FILE);
}

function saveUsers(users) {
  ensureFiles();
  writeJson(USERS_FILE, users);
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post('/api/signup', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const pass = String(password || '').trim();

  if (!name || !pass || name.length < 3 || pass.length < 4) {
    return res.status(400).json({ error: 'Ange användarnamn och lösenord (minst 3/4 tecken).' });
  }

  const users = getUsers();
  if (users[name]) {
    return res.status(409).json({ error: 'Det kontot finns redan. Logga in istället.' });
  }

  const isAdmin = name.toLowerCase() === 'admin';

  users[name] = {
    username: name,
    isAdmin,
    password: hashPassword(pass),
    score: 0,
    level: 1,
    streak: 0,
    caught: 0,
    qCount: 0,
    coins: 0,
    mode: 'mixed',
    inventory: {},
    shinyInventory: {},
    avatar: { skin: '🙂', hat: '', aura: '', title: 'Tränare' }
  };

  saveUsers(users);
  res.json({ success: true, user: sanitizeUser(users[name]) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const pass = String(password || '').trim();

  if (!name || !pass) {
    return res.status(400).json({ error: 'Saknar användarnamn eller lösenord.' });
  }

  const users = getUsers();
  const user = users[name];
  if (!user || user.password !== hashPassword(pass)) {
    return res.status(401).json({ error: 'Fel tränarnamn eller lösenord.' });
  }

  user.isAdmin = Boolean(user.isAdmin || name.toLowerCase() === 'admin');
  saveUsers(users);

  res.json({ success: true, user: sanitizeUser(user) });
});

app.post('/api/save', (req, res) => {
  const { username, password, game } = req.body || {};
  const name = String(username || '').trim();
  const pass = String(password || '').trim();

  if (!name || !pass || !game) {
    return res.status(400).json({ error: 'Saknar data.' });
  }

  const users = getUsers();
  const user = users[name];
  if (!user || user.password !== hashPassword(pass)) {
    return res.status(401).json({ error: 'Fel tränarnamn eller lösenord.' });
  }

  user.isAdmin = Boolean(user.isAdmin || name.toLowerCase() === 'admin');

  const saved = {
    ...user,
    score: Number(game.score || 0),
    level: Number(game.level || 1),
    streak: Number(game.streak || 0),
    caught: Number(game.caught || 0),
    qCount: Number(game.qCount || 0),
    coins: Number(game.coins || 0),
    mode: game.mode || 'mixed',
    inventory: game.inventory || {},
    shinyInventory: game.shinyInventory || {}
  };

  users[name] = saved;
  saveUsers(users);
  res.json({ success: true, user: sanitizeUser(saved) });
});

app.get('/api/users', (_, res) => {
  const users = getUsers();
  const list = Object.keys(users).map((name) => ({
    username: name,
    isAdmin: Boolean(users[name].isAdmin || name.toLowerCase() === 'admin'),
    caught: Number(users[name].caught || 0),
    coins: Number(users[name].coins || 0),
    score: Number(users[name].score || 0),
    level: Number(users[name].level || 1)
  }));
  res.json({ users: list });
});

app.get('/api/meta', (_, res) => {
  ensureFiles();
  const meta = readJson(META_FILE);
  res.json({ message: meta.message || '', time: meta.time || 0 });
});

app.post('/api/meta', (req, res) => {
  const { username, password, message } = req.body || {};
  const name = String(username || '').trim();
  const pass = String(password || '').trim();

  const users = getUsers();
  const user = users[name];
  if (!user || user.password !== hashPassword(pass) || (!user.isAdmin && name.toLowerCase() !== 'admin')) {
    return res.status(403).json({ error: 'Endast admin kan ändra globalt meddelande.' });
  }

  const meta = readJson(META_FILE);
  meta.message = String(message || '');
  meta.time = Date.now();
  writeJson(META_FILE, meta);
  res.json({ success: true, meta });
});

app.post('/api/spawn', (req, res) => {
  const { username, password, pokemonId, shiny } = req.body || {};
  const name = String(username || '').trim();
  const pass = String(password || '').trim();

  const users = getUsers();
  const user = users[name];
  if (!user || user.password !== hashPassword(pass) || (!user.isAdmin && name.toLowerCase() !== 'admin')) {
    return res.status(403).json({ error: 'Endast admin kan spawna Pokémon.' });
  }

  Object.keys(users).forEach((accountName) => {
    const acc = users[accountName];
    if (shiny) {
      acc.shinyInventory = acc.shinyInventory || {};
      acc.shinyInventory[pokemonId] = (acc.shinyInventory[pokemonId] || 0) + 1;
    } else {
      acc.inventory = acc.inventory || {};
      acc.inventory[pokemonId] = (acc.inventory[pokemonId] || 0) + 1;
    }
  });

  saveUsers(users);
  res.json({ success: true });
});

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});
