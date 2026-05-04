const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const initialState = {
  templates: [],
  events: [],
  promoPlans: {},
  promoLogs: [],
  settings: {
    promoPaused: false,
  },
};

function ensureFile() {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  if (!fs.existsSync(config.dataFile)) {
    fs.writeFileSync(config.dataFile, JSON.stringify(initialState, null, 2));
  }
}

function read() {
  ensureFile();
  const raw = fs.readFileSync(config.dataFile, 'utf8');
  return { ...initialState, ...JSON.parse(raw) };
}

function write(data) {
  ensureFile();
  fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2));
}

function update(mutator) {
  const data = read();
  const result = mutator(data);
  write(data);
  return result;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { read, write, update, makeId };
