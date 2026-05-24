// --- Auth Module ---
// Simple nickname-based auth with JSON file storage

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'users.json');

function readUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateInviteCode() {
  return crypto.randomBytes(3).toString('hex');
}

function generateId() {
  return 'u_' + crypto.randomBytes(8).toString('hex');
}

export function login(name) {
  const users = readUsers();
  // Find existing user by name or create new
  let user = Object.values(users).find(u => u.name === name);
  const isNew = !user;

  if (isNew) {
    const id = generateId();
    user = {
      id,
      name,
      plan: 'free',
      dailyUsage: { date: '', count: 0 },
      permanentTokens: 0,
      inviteCode: generateInviteCode(),
      invitedBy: null,
      inviteCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  const token = generateToken();
  user.token = token;
  user.lastLogin = new Date().toISOString();
  users[user.id] = user;
  writeUsers(users);

  return { user: { ...user, token: undefined }, token, isNew };
}

export function getUserByToken(token) {
  const users = readUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) return null;
  return { ...user, token: undefined };
}

export function updateUser(id, updates) {
  const users = readUsers();
  if (!users[id]) return null;
  Object.assign(users[id], updates);
  writeUsers(users);
  return { ...users[id], token: undefined };
}

export function getUser(id) {
  const users = readUsers();
  return users[id] || null;
}

export function getUserByInviteCode(code) {
  const users = readUsers();
  return Object.values(users).find(u => u.inviteCode === code) || null;
}

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getUsage(user) {
  const today = getTodayKey();
  if (user.dailyUsage.date !== today) {
    return { date: today, count: 0 };
  }
  return user.dailyUsage;
}

export function incrementUsage(userId) {
  const user = getUser(userId);
  if (!user) return;
  const today = getTodayKey();
  const usage = user.dailyUsage.date === today ? user.dailyUsage : { date: today, count: 0 };
  usage.count++;
  user.dailyUsage = usage;
  const users = readUsers();
  users[userId] = user;
  writeUsers(users);
}

export function spendToken(userId) {
  const user = getUser(userId);
  if (!user) return false;
  const today = getTodayKey();
  const usage = user.dailyUsage.date === today ? user.dailyUsage : { date: today, count: 0 };

  // Permanent tokens first
  if (user.permanentTokens > 0) {
    user.permanentTokens--;
    const users = readUsers();
    users[userId] = user;
    writeUsers(users);
    return true;
  }

  // Free daily limit
  if (user.plan === 'pro') return true;
  const limit = user.plan === 'basic' ? (user.basicRemaining || 0) : 5;
  if (usage.count < limit) {
    usage.count++;
    user.dailyUsage = usage;
    const users = readUsers();
    users[userId] = user;
    writeUsers(users);
    return true;
  }

  return false;
}

export function getRemainingUsage(userId) {
  const user = getUser(userId);
  if (!user) return { remaining: 0, plan: 'free', permanentTokens: 0 };
  if (user.plan === 'pro') return { remaining: Infinity, plan: 'pro', permanentTokens: user.permanentTokens };
  const today = getTodayKey();
  const count = user.dailyUsage.date === today ? user.dailyUsage.count : 0;
  const limit = user.plan === 'basic' ? (user.basicRemaining || 0) : 5;
  const dailyRemaining = Math.max(0, limit - count);
  return {
    remaining: dailyRemaining + user.permanentTokens,
    dailyRemaining,
    permanentTokens: user.permanentTokens,
    plan: user.plan,
  };
}
