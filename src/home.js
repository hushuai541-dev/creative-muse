// --- Creative Muse — Homepage ---

import './style.css';
import * as Auth from './auth.js';

function init() {
  initLoginUI();
  initProfileModal();
  initInput();
  initPricing();
  updateUsageDisplay();
  checkInviteCode();
}

function initProfileModal() {
  document.getElementById('profile-close').addEventListener('click', () => {
    document.getElementById('profile-overlay').classList.add('hidden');
  });
  document.getElementById('profile-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('profile-overlay').classList.add('hidden');
  });
  document.getElementById('profile-copy-link').addEventListener('click', async () => {
    const user = Auth.getUser();
    if (!user) return;
    const link = `${window.location.origin}/home?ref=${user.inviteCode}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      alert('邀请链接已复制！');
    }
  });
  document.getElementById('profile-upgrade').addEventListener('click', () => {
    document.getElementById('profile-overlay').classList.add('hidden');
    showPricingModal();
  });
  document.getElementById('profile-invite-btn').addEventListener('click', async () => {
    const code = document.getElementById('profile-invite-input').value.trim();
    if (!code) return;
    const name = Auth.getUser()?.name || '用户';
    try {
      const result = await Auth.redeemInvite(code, name);
      if (result.success) {
        alert(`兑换成功！+${result.reward} 次永久发散次数`);
        updateUsageDisplay();
        document.getElementById('profile-invite-input').value = '';
      } else {
        alert(result.error || '兑换失败');
      }
    } catch (err) {
      alert('兑换失败：' + err.message);
    }
  });
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
  // Refresh from server
  try { await Auth.fetchMe(); } catch {}
  const stats = await Auth.getInviteStats();
  const user = Auth.getUser();
  const remaining = await Auth.getRemaining();
  const inviteLink = `${window.location.origin}/home?ref=${user.inviteCode}`;

  document.getElementById('profile-name-display').textContent = user.name;
  document.getElementById('profile-plan').textContent = remaining.plan === 'pro' ? 'Pro 无限' : remaining.plan === 'basic' ? '基础版' : '免费版';
  document.getElementById('profile-remaining').textContent = remaining.remaining === Infinity ? '无限' : String(remaining.remaining);
  document.getElementById('profile-invites').textContent = stats.inviteCount + ' 人';
  document.getElementById('profile-code').textContent = user.inviteCode;
  document.getElementById('profile-code').onclick = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(user.inviteCode);
      alert('邀请码已复制！');
    }
  };

  document.getElementById('profile-overlay').classList.remove('hidden');
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

let pendingPlan = null;
let savedPricingHTML = null;

function showPaymentStep(plan) {
  pendingPlan = plan;
  const price = plan === 'pro' ? '19.90' : '3.90';
  const name = plan === 'pro' ? 'Pro 版' : '基础版';
  const content = document.getElementById('pricing-content');
  // Save original plan cards HTML before replacing
  if (!savedPricingHTML) {
    savedPricingHTML = content.innerHTML;
  }
  content.innerHTML = `
    <button id="pricing-close" class="pricing-close">✕</button>
    <h2 class="pricing-title">扫码支付</h2>
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:32px;font-weight:900;color:var(--accent);margin-bottom:4px">¥${price}</div>
      <div style="font-size:14px;color:var(--text-secondary)">${name}</div>
    </div>
    <img src="/qr-code.png" alt="微信收款码" style="width:200px;height:200px;margin:0 auto 20px;display:block;border-radius:16px;border:2px solid var(--accent)" />
    <ol style="font-size:13px;color:var(--text-secondary);line-height:2;padding-left:20px;margin-bottom:20px">
      <li>微信扫描上方二维码付款</li>
      <li>付款后点击下方按钮</li>
      <li>支付后自动开通</li>
    </ol>
    <button id="pay-confirm" class="pricing-btn primary" style="width:100%">我已支付，开通${name}</button>
    <button id="pay-back" style="width:100%;padding:8px;margin-top:8px;border-radius:10px;border:1px solid var(--surface-border);background:transparent;color:var(--text-muted);font-size:13px;cursor:pointer;font-family:var(--font)">← 返回选择套餐</button>
  `;
  document.getElementById('pricing-close').addEventListener('click', hidePricingModal);
  document.getElementById('pay-back').addEventListener('click', () => {
    pendingPlan = null;
    hidePricingModal();
    setTimeout(showPricingModal, 200);
  });
  document.getElementById('pay-confirm').addEventListener('click', async () => {
    try {
      await Auth.upgradePlan(pendingPlan);
      await updateUsageDisplay();
      hidePricingModal();
      alert(`已开通${name}！`);
    } catch (err) {
      alert('开通失败：' + err.message);
    }
  });
}

function initPricing() {
  document.getElementById('pricing-close').addEventListener('click', hidePricingModal);
  document.getElementById('pricing-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hidePricingModal();
  });
  document.querySelectorAll('#pricing-overlay .pricing-btn.primary').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      if (!Auth.isLoggedIn()) {
        showLoginModal();
        return;
      }
      showPaymentStep(plan);
    });
  });
}

async function showPricingModal() {
  // Restore original plan cards if they were replaced by payment step
  const content = document.getElementById('pricing-content');
  if (savedPricingHTML && !document.getElementById('plan-free')) {
    content.innerHTML = savedPricingHTML;
    savedPricingHTML = null;
    // Re-bind pricing button events
    document.getElementById('pricing-close').addEventListener('click', hidePricingModal);
    document.getElementById('pricing-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) hidePricingModal();
    });
    document.querySelectorAll('#pricing-overlay .pricing-btn.primary').forEach(btn => {
      btn.addEventListener('click', () => {
        const plan = btn.dataset.plan;
        if (!Auth.isLoggedIn()) {
          showLoginModal();
          return;
        }
        showPaymentStep(plan);
      });
    });
  }
  let plan = 'free';
  try {
    const r = await Auth.getRemaining();
    plan = r.plan || 'free';
  } catch {}
  document.querySelectorAll('.pricing-card').forEach(c => c.classList.remove('current-plan'));
  if (plan === 'free') {
    document.getElementById('plan-free')?.classList.add('current-plan');
  } else if (plan === 'basic') {
    document.getElementById('plan-basic')?.classList.add('current-plan');
  } else {
    document.getElementById('plan-pro')?.classList.add('current-plan');
  }
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
