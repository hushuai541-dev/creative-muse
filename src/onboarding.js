// --- Onboarding Module ---

const ONBOARDING_KEY = 'creative-muse-onboarding-done';

export function isFirstTime() {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function markDone() {
  localStorage.setItem(ONBOARDING_KEY, '1');
}

export function showOnboarding(onComplete) {
  if (!isFirstTime()) {
    if (onComplete) onComplete();
    return;
  }

  const steps = [
    {
      title: '输入关键词',
      desc: '在输入框中输入你想分析的主题，开始灵感发散',
    },
    {
      title: '深入拓展',
      desc: '点击节点下方的黄色 + 号，选择发散模式继续挖掘',
    },
    {
      title: '获取更多次数',
      desc: '每天免费 5 次 · 邀请好友各得 5 次 · 升级 Pro 无限使用',
    },
  ];

  let currentStep = 0;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';

  const card = document.createElement('div');
  card.className = 'onboarding-card';

  function render() {
    const s = steps[currentStep];
    card.innerHTML = `
      <div class="onboarding-step-indicator">${currentStep + 1} / ${steps.length}</div>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
      <div class="onboarding-btns">
        <button class="onboarding-skip">跳过</button>
        <button class="onboarding-next">${currentStep === steps.length - 1 ? '开始使用' : '下一步 →'}</button>
      </div>
    `;
    card.querySelector('.onboarding-skip').addEventListener('click', () => close());
    card.querySelector('.onboarding-next').addEventListener('click', () => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        render();
      } else {
        close();
      }
    });
  }

  function close() {
    markDone();
    overlay.remove();
    if (onComplete) onComplete();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  render();
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
