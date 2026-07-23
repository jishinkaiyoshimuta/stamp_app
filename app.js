const STORAGE_KEY = 'ytManagerState';

function defaultState() {
  return {
    settings: {
      parentPin: null,
      stampsPerTicket: 3,
      tasks: ['がくしゅう', 'プリント', 'おてつだい'],
      rewards: [
        { id: uid(), name: 'YouTube 15分', cost: 1 }
      ]
    },
    progress: {
      stamps: 0,
      tickets: 0
    },
    requests: [],
    redemptions: [],
    history: []
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  return JSON.parse(raw);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = load();
let pendingPinAction = null;

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function goChild() {
  showScreen('screen-child');
  renderChild();
}

function requestParentAccess(onSuccess) {
  pendingPinAction = onSuccess;
  document.getElementById('parent-pin-input').value = '';
  document.getElementById('parent-pin-error').classList.add('hidden');
  showScreen('screen-parent-pin');
}

// --- 子供画面 ---

function renderChild() {
  const total = state.settings.stampsPerTicket;
  const filled = state.progress.stamps;
  let stampHtml = '';
  for (let i = 0; i < total; i++) {
    stampHtml += i < filled ? '❤️' : '🤍';
  }
  document.getElementById('child-stamp-progress').textContent = stampHtml;
  document.getElementById('child-ticket-count').textContent = `🎟 チケット ${state.progress.tickets}まい`;

  const redeemBtn = document.getElementById('child-redeem-open');
  const canRedeemAny = state.settings.rewards.some(r => r.cost <= state.progress.tickets);
  redeemBtn.disabled = state.settings.rewards.length === 0 || !canRedeemAny;

  const listEl = document.getElementById('child-request-list');
  const stampItems = state.requests.slice(-5).map(r => ({ kind: 'stamp', label: r.task, status: r.status, at: r.requestedAt }));
  const redeemItems = state.redemptions.slice(-5).map(r => ({ kind: 'redeem', label: `🎟 ${r.rewardName}`, status: r.status, at: r.requestedAt }));
  const combined = stampItems.concat(redeemItems).sort((a, b) => a.at - b.at).slice(-5).reverse();

  if (combined.length === 0) {
    listEl.innerHTML = '';
  } else {
    listEl.innerHTML = combined.map(r => {
      const statusText = r.status === 'pending' ? '確認中' : r.status === 'approved' ? '承認された!' : '却下された';
      const statusClass = r.status === 'pending' ? 'status-pending' : r.status === 'approved' ? 'status-approved' : 'status-rejected';
      return `<div class="request-item"><span>${escapeHtml(r.label)}</span><span class="${statusClass}">${statusText}</span></div>`;
    }).join('');
  }
}

function openRequestModal() {
  const listEl = document.getElementById('task-choice-list');
  listEl.innerHTML = state.settings.tasks.map(t =>
    `<button class="task-choice-btn" data-task="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
  listEl.querySelectorAll('.task-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      submitRequest(btn.dataset.task);
      document.getElementById('modal-request').classList.add('hidden');
    });
  });
  document.getElementById('modal-request').classList.remove('hidden');
}

function submitRequest(task) {
  state.requests.push({
    id: uid(),
    task,
    requestedAt: Date.now(),
    status: 'pending'
  });
  save();
  renderChild();
}

function openRedeemModal() {
  const listEl = document.getElementById('reward-choice-list');
  listEl.innerHTML = state.settings.rewards.map(r => {
    const disabled = r.cost > state.progress.tickets ? 'disabled' : '';
    return `<button class="task-choice-btn" data-id="${r.id}" ${disabled}>${escapeHtml(r.name)}(チケット${r.cost}まい)</button>`;
  }).join('');
  listEl.querySelectorAll('.task-choice-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const reward = state.settings.rewards.find(r => r.id === btn.dataset.id);
      submitRedemption(reward);
      document.getElementById('modal-redeem').classList.add('hidden');
    });
  });
  document.getElementById('modal-redeem').classList.remove('hidden');
}

function submitRedemption(reward) {
  state.redemptions.push({
    id: uid(),
    rewardId: reward.id,
    rewardName: reward.name,
    cost: reward.cost,
    requestedAt: Date.now(),
    status: 'pending'
  });
  save();
  renderChild();
}

// --- 親: 承認 ---

function renderApproveStampList() {
  const listEl = document.getElementById('approve-stamp-list');
  const pending = state.requests.filter(r => r.status === 'pending');
  if (pending.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">申請はありません</p>';
    return;
  }
  listEl.innerHTML = pending.map(r => `
    <div class="approve-item" data-id="${r.id}">
      <div class="approve-item-info">
        <div class="task-name">${escapeHtml(r.task)}</div>
        <div class="task-time">${formatDateTime(r.requestedAt)}</div>
      </div>
      <div class="approve-actions">
        <button class="btn btn-green approve-btn">承認</button>
        <button class="btn btn-outline reject-btn">却下</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.approve-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.approve-btn').addEventListener('click', () => approveStamp(id));
    item.querySelector('.reject-btn').addEventListener('click', () => rejectStamp(id));
  });
}

function approveStamp(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = 'approved';
  req.respondedAt = Date.now();
  state.progress.stamps += 1;
  state.history.push({ id: uid(), type: 'stamp_approved', task: req.task, at: Date.now() });

  if (state.progress.stamps >= state.settings.stampsPerTicket) {
    state.progress.stamps -= state.settings.stampsPerTicket;
    state.progress.tickets += 1;
    state.history.push({ id: uid(), type: 'ticket_earned', at: Date.now() });
  }
  save();
  renderApproveStampList();
}

function rejectStamp(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = 'rejected';
  req.respondedAt = Date.now();
  save();
  renderApproveStampList();
}

function renderApproveRedeemList() {
  const listEl = document.getElementById('approve-redeem-list');
  const pending = state.redemptions.filter(r => r.status === 'pending');
  if (pending.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">申請はありません</p>';
    return;
  }
  listEl.innerHTML = pending.map(r => `
    <div class="approve-item" data-id="${r.id}">
      <div class="approve-item-info">
        <div class="task-name">🎟 ${escapeHtml(r.rewardName)}(チケット${r.cost}まい)</div>
        <div class="task-time">${formatDateTime(r.requestedAt)}</div>
      </div>
      <div class="approve-actions">
        <button class="btn btn-green approve-btn">承認</button>
        <button class="btn btn-outline reject-btn">却下</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.approve-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.approve-btn').addEventListener('click', () => approveRedeem(id));
    item.querySelector('.reject-btn').addEventListener('click', () => rejectRedeem(id));
  });
}

function approveRedeem(id) {
  const r = state.redemptions.find(x => x.id === id);
  if (!r) return;
  if (state.progress.tickets < r.cost) {
    alert('チケットが足りません');
    return;
  }
  r.status = 'approved';
  r.respondedAt = Date.now();
  state.progress.tickets -= r.cost;
  state.history.push({ id: uid(), type: 'reward_redeemed', rewardName: r.rewardName, cost: r.cost, at: Date.now() });
  save();
  renderApproveRedeemList();
}

function rejectRedeem(id) {
  const r = state.redemptions.find(x => x.id === id);
  if (!r) return;
  r.status = 'rejected';
  r.respondedAt = Date.now();
  save();
  renderApproveRedeemList();
}

// --- 親: 設定 ---

function renderSettingsForm() {
  document.getElementById('settings-pin').value = state.settings.parentPin || '';
  document.getElementById('settings-stamps').value = state.settings.stampsPerTicket;
  renderSettingsTaskList();
  renderSettingsRewardList();
}

function renderSettingsTaskList() {
  const listEl = document.getElementById('settings-task-list');
  listEl.innerHTML = state.settings.tasks.map((t, i) => `
    <div class="settings-task-item" data-index="${i}">
      <span>${escapeHtml(t)}</span>
      <button class="task-remove-btn">削除</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.settings-task-item').forEach(item => {
    const i = Number(item.dataset.index);
    item.querySelector('.task-remove-btn').addEventListener('click', () => {
      state.settings.tasks.splice(i, 1);
      renderSettingsTaskList();
    });
  });
}

function renderSettingsRewardList() {
  const listEl = document.getElementById('settings-reward-list');
  listEl.innerHTML = state.settings.rewards.map((r, i) => `
    <div class="settings-task-item" data-index="${i}">
      <span>${escapeHtml(r.name)}(チケット${r.cost}まい)</span>
      <button class="reward-remove-btn">削除</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.settings-task-item').forEach(item => {
    const i = Number(item.dataset.index);
    item.querySelector('.reward-remove-btn').addEventListener('click', () => {
      state.settings.rewards.splice(i, 1);
      renderSettingsRewardList();
    });
  });
}

function saveSettingsForm() {
  const pin = document.getElementById('settings-pin').value.trim();
  const stamps = Number(document.getElementById('settings-stamps').value);

  if (pin) state.settings.parentPin = pin;
  if (stamps > 0) state.settings.stampsPerTicket = stamps;

  save();
  renderChild();
  alert('設定を保存しました');
}

// --- 親: 履歴 ---

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const items = state.history.slice().reverse();
  if (items.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">履歴はありません</p>';
    return;
  }
  listEl.innerHTML = items.map(h => {
    let label;
    if (h.type === 'stamp_approved') label = `スタンプ承認: ${escapeHtml(h.task)}`;
    else if (h.type === 'ticket_earned') label = '🎟 チケット獲得!';
    else label = `🎟 ${escapeHtml(h.rewardName)} と交換(チケット${h.cost}まい)`;
    return `<div class="history-item"><span>${label}</span><span class="task-time">${formatDateTime(h.at)}</span></div>`;
  }).join('');
}

// --- タブ切り替え ---

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  if (tab === 'approve') {
    renderApproveStampList();
    renderApproveRedeemList();
  }
  if (tab === 'settings') renderSettingsForm();
  if (tab === 'history') renderHistory();
}

// --- 初期化 ---

function init() {
  if (!state.settings.parentPin) {
    showScreen('screen-setup');
  } else {
    goChild();
  }

  document.getElementById('setup-save').addEventListener('click', () => {
    const pin = document.getElementById('setup-pin').value.trim();
    if (!pin) {
      alert('暗証番号を入力してください');
      return;
    }
    state.settings.parentPin = pin;
    state.settings.stampsPerTicket = Number(document.getElementById('setup-stamps').value) || 3;
    save();
    goChild();
  });

  document.getElementById('child-request-open').addEventListener('click', openRequestModal);
  document.getElementById('request-cancel').addEventListener('click', () => {
    document.getElementById('modal-request').classList.add('hidden');
  });

  document.getElementById('child-redeem-open').addEventListener('click', openRedeemModal);
  document.getElementById('redeem-cancel').addEventListener('click', () => {
    document.getElementById('modal-redeem').classList.add('hidden');
  });

  document.getElementById('child-goto-parent').addEventListener('click', () => {
    requestParentAccess(() => {
      showScreen('screen-parent');
      switchTab('approve');
    });
  });

  document.getElementById('parent-pin-submit').addEventListener('click', () => {
    const input = document.getElementById('parent-pin-input').value.trim();
    if (input === state.settings.parentPin) {
      const action = pendingPinAction;
      pendingPinAction = null;
      if (action) action();
    } else {
      document.getElementById('parent-pin-error').classList.remove('hidden');
    }
  });
  document.getElementById('parent-pin-cancel').addEventListener('click', goChild);

  document.getElementById('parent-goto-child').addEventListener('click', goChild);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('settings-save').addEventListener('click', saveSettingsForm);
  document.getElementById('settings-task-add').addEventListener('click', () => {
    const input = document.getElementById('settings-task-new');
    const val = input.value.trim();
    if (val) {
      state.settings.tasks.push(val);
      input.value = '';
      renderSettingsTaskList();
    }
  });

  document.getElementById('settings-reward-add').addEventListener('click', () => {
    const nameInput = document.getElementById('settings-reward-name');
    const costInput = document.getElementById('settings-reward-cost');
    const name = nameInput.value.trim();
    const cost = Number(costInput.value) || 1;
    if (name) {
      state.settings.rewards.push({ id: uid(), name, cost });
      nameInput.value = '';
      costInput.value = '1';
      renderSettingsRewardList();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
