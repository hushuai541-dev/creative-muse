// --- Creative Muse — Homepage ---

import './style.css';
import * as Auth from './auth.js';

function init() {
  initLoginUI();
  initInput();
  initPricing();
  updateUsageDisplay();
  checkInviteCode();
}

function initLoginUI() {
  const btn = document.getElementById('home-login-btn');
  const user = Auth.getUser();
  if (user) {
    btn.textContent = user.name;
    btn.classList.add('logged-in');
  }
  btn.addEventListener('click', () => {
    if (Auth.isLoggedIn()) {
      // Show profile/invite info
      showProfile();
    } else {
      showLoginModal();
    }
  });
  document.getElementById('login-submit-btn').addEventListener('click', doLogin);
  document.getElementById('login-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-close').addEventListener('click', hideLoginModal);
  document.getElementById('login-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideLoginModal();
  });
}

async function doLogin() {
  const input = document.getElementById('login-name-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    const data = await Auth.login(name);
    document.getElementById('home-login-btn').textContent = data.user.name;
    document.getElementById('home-login-btn').classList.add('logged-in');
    hideLoginModal();
    updateUsageDisplay();
  } catch (err) {
    alert('登录失败：' + err.message);
  }
}

function showLoginModal() {
  document.getElementById('login-overlay').classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('login-overlay').classList.add('hidden');
}

async function showProfile() {
  const stats = await Auth.getInviteStats();
  const user = Auth.getUser();
  const remaining = await Auth.getRemaining();
  const inviteLink = `${window.location.origin}/home?ref=${user.inviteCode}`;
  const msg = [
    `昵称：${user.name}`,
    `套餐：${remaining.plan === 'pro' ? 'Pro 无限' : remaining.plan === 'basic' ? '基础版' : '免费版'}`,
    `剩余次数：${remaining.remaining === Infinity ? '无限' : remaining.remaining}`,
    `已邀请：${stats.inviteCount} 人`,
    ``,
    `邀请链接：${inviteLink}`,
  ].join('\n');
  if (navigator.clipboard && confirm(msg + '\n\n复制邀请链接？')) {
    await navigator.clipboard.writeText(inviteLink);
    alert('邀请链接已复制！好友通过链接访问并注册，双方各得 5 次。');
  } else {
    alert(msg);
  }
}

function initInput() {
  const input = document.getElementById('home-word-input');
  const btn = document.getElementById('home-submit-btn');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
  btn.addEventListener('click', () => {
    const word = input.value.trim();
    if (!word) return;
    if (!Auth.isLoggedIn()) {
      showLoginModal();
      return;
    }
    // Navigate to workspace with word
    window.location.href = `/?word=${encodeURIComponent(word)}`;
  });
}

function initPricing() {
  document.getElementById('pricing-close').addEventListener('click', hidePricingModal);
  document.getElementById('pricing-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hidePricingModal();
  });
  document.querySelectorAll('#pricing-overlay .pricing-btn.primary').forEach(btn => {
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.plan;
      if (!Auth.isLoggedIn()) {
        showLoginModal();
        return;
      }
      try {
        await Auth.upgradePlan(plan);
        hidePricingModal();
        updateUsageDisplay();
        alert(plan === 'pro' ? '已升级至 Pro 版！' : '已升级至基础版！');
      } catch (err) {
        alert('升级失败：' + err.message);
      }
    });
  });
}

function showPricingModal() {
  document.getElementById('pricing-overlay').classList.remove('hidden');
}

function hidePricingModal() {
  document.getElementById('pricing-overlay').classList.add('hidden');
}

async function updateUsageDisplay() {
  const el = document.getElementById('home-remaining');
  if (!el) return;
  try {
    const r = await Auth.getRemaining();
    if (r.plan === 'pro') {
      el.textContent = 'Pro · 无限次数';
      el.className = 'home-remaining pro';
    } else if (r.plan === 'basic') {
      el.textContent = `基础版 · 剩余 ${r.remaining} 次`;
      el.className = 'home-remaining basic';
    } else {
      el.textContent = `今日剩余免费 ${r.remaining} 次`;
      el.className = 'home-remaining free';
    }
    el.style.cursor = 'pointer';
    el.addEventListener('click', showPricingModal);
  } catch {
    el.textContent = '今日剩余免费 5 次';
  }
}

function checkInviteCode() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && !Auth.isLoggedIn()) {
    showLoginModal();
    // After login, redeem
    const origSubmit = document.getElementById('login-submit-btn').onclick;
    document.getElementById('login-submit-btn').addEventListener('click', async function handler() {
      try {
        const name = document.getElementById('login-name-input').value.trim();
        if (!name) return;
        await Auth.redeemInvite(ref, name);
        updateUsageDisplay();
        alert('已接受邀请！你和邀请人各获得 5 次永久发散次数。');
      } catch {}
      document.getElementById('login-submit-btn').removeEventListener('click', handler);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
