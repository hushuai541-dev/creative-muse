// --- Auth Module ---

const AUTH_KEY = 'creative-muse-auth';
let currentUser = null;
let authToken = null;

export function getToken() {
  if (authToken) return authToken;
  try {
    const data = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    authToken = data.token || null;
    currentUser = data.user || null;
  } catch { authToken = null; currentUser = null; }
  return authToken;
}

export function getUser() {
  if (currentUser) return currentUser;
  try {
    const data = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    currentUser = data.user || null;
    authToken = data.token || null;
  } catch { currentUser = null; authToken = null; }
  return currentUser;
}

export function isLoggedIn() {
  return !!getToken();
}

function saveAuth(user, token) {
  currentUser = user;
  authToken = token;
  localStorage.setItem(AUTH_KEY, JSON.stringify({ user, token }));
}

export function logout() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem(AUTH_KEY);
}

export async function login(name) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '登录失败');
  }
  const data = await res.json();
  saveAuth(data.user, data.token);
  return data;
}

export async function fetchMe() {
  const token = getToken();
  if (!token) throw new Error('未登录');
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    logout();
    throw new Error('登录已过期');
  }
  const data = await res.json();
  currentUser = data.user;
  if (data.user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: data.user, token }));
  }
  return data;
}

export async function getRemaining() {
  const token = getToken();
  if (!token) return { remaining: 5, plan: 'free', permanentTokens: 0 };
  try {
    const res = await fetch('/api/auth/usage', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { remaining: 5, plan: 'free', permanentTokens: 0 };
  }
}

export async function spendOneUse() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/auth/use', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok;
  } catch {
    return false;
  }
}

export async function upgradePlan(plan) {
  const token = getToken();
  if (!token) throw new Error('未登录');
  const res = await fetch('/api/auth/upgrade', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error('升级失败');
  const data = await res.json();
  if (data.user) {
    currentUser = data.user;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: data.user, token }));
  }
  return data;
}

export async function redeemInvite(inviteCode, name) {
  const res = await fetch('/api/invite/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode, name }),
  });
  if (!res.ok) throw new Error('兑换失败');
  const data = await res.json();
  if (data.token && data.user) {
    saveAuth(data.user, data.token);
  }
  return data;
}

export async function getInviteStats() {
  const token = getToken();
  if (!token) return { inviteCount: 0, permanentTokens: 0 };
  try {
    const res = await fetch('/api/invite/stats', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { inviteCount: 0, permanentTokens: 0 };
  }
}
