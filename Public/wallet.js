(() => {
  const $ = id => document.getElementById(id);
  let wallet = null;
  let shopItems = [];
  let charismaLevels = [];
  let selectedSlot = 0;
  let selectedDenomination = 100;
  let rouletteState = null;
  let rouletteSocket = null;
  let rouletteCountdownTimer = null;
  let rouletteResultsAutoCloseTimer = null;
  let lastAnimatedRoundId = '';
  let lastShownResultRoundId = '';
  let wheelRotation = 0;
  let recentRouletteBet = null;
  let pendingRouletteBets = 0;
  let toastTimer = null;

  const DEFAULT_ROULETTE_SLOTS = [
    {slot:0, icon:'🍉', label:'بطيخ', category:'fruit', multiplier:5, chancePercent:19.4},
    {slot:1, icon:'🍊', label:'برتقال', category:'fruit', multiplier:5, chancePercent:19.4},
    {slot:2, icon:'🍎', label:'تفاح', category:'fruit', multiplier:5, chancePercent:19.4},
    {slot:3, icon:'🥬', label:'خضار', category:'fruit', multiplier:5, chancePercent:19.4},
    {slot:4, icon:'🐟', label:'سمك', category:'meat', multiplier:10, chancePercent:9.5},
    {slot:5, icon:'🍔', label:'برغر', category:'meat', multiplier:15, chancePercent:7},
    {slot:6, icon:'🍤', label:'روبيان', category:'meat', multiplier:25, chancePercent:3.8},
    {slot:7, icon:'🍗', label:'دجاج', category:'meat', multiplier:45, chancePercent:2.1}
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const formatDate = value => {
    if (!value) return '';
    try { return new Date(value).toLocaleString('ar-IQ', {dateStyle:'short', timeStyle:'short'}); } catch (_) { return String(value); }
  };

  function showToast(message, error = false) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 3200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) { location.replace('login.html'); throw new Error(data.error || 'انتهت الجلسة'); }
    if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب');
    return data;
  }

  function setBalance(coins) {
    const value = Number(coins || 0).toLocaleString('en-US');
    if ($('coinBalance')) $('coinBalance').textContent = value;
    if ($('topCoins')) $('topCoins').textContent = value;
  }

  function giftEmoji(item = {}) {
    const kind = String(item.metadata?.giftKind || item.itemId || item.name || '').toLowerCase();
    if (kind.includes('king-lucky') || kind.includes('lucky')) return '💎';
    if (kind.includes('king') || kind.includes('crown') || kind.includes('ملك')) return '👑';
    if (kind.includes('heart') || kind.includes('قلب')) return '💖';
    if (kind.includes('star') || kind.includes('نجمة')) return '🌟';
    if (kind.includes('rose') || kind.includes('ورد')) return '🌹';
    if (kind.includes('chest') || kind.includes('box') || kind.includes('صندوق')) return '🎁';
    return item.metadata?.iconEmoji || '🎁';
  }

  function itemVisual(item) {
    if (item.imageUrl || item.frameUrl) return `<img src="${escapeHtml(item.imageUrl || item.frameUrl)}" alt=""${item.animated ? ' class="animated-gift"' : ''}>`;
    return `<span class="gift-art gift-art-${escapeHtml(item.metadata?.giftKind || 'default')}"><span aria-hidden="true">${escapeHtml(giftEmoji(item))}</span><i class="fa-solid ${escapeHtml(item.icon || 'fa-gift')}" aria-hidden="true"></i></span>`;
  }

  function giftVisual(gift) {
    if (gift.imageUrl) return `<img src="${escapeHtml(gift.imageUrl)}" alt=""${gift.animated ? ' class="animated-gift"' : ''}>`;
    return `<span class="gift-art gift-art-${escapeHtml(gift.metadata?.giftKind || 'default')}"><span aria-hidden="true">${escapeHtml(giftEmoji(gift))}</span><i class="fa-solid ${escapeHtml(gift.icon || 'fa-gift')}" aria-hidden="true"></i></span>`;
  }

  function showGiftReward(data) {
    const reward = data?.reward;
    if (!reward) return;
    const secretMatched = Boolean(reward.secretMatched || reward.lucky);
    const old = document.querySelector('.gift-reward-popover');
    old?.remove();
    const panel = document.createElement('div');
    panel.className = `gift-reward-popover${secretMatched ? ' is-lucky' : reward.mysteryOpened ? ' is-mystery' : ''}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'gift-reward-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'إغلاق');
    const icon = document.createElement('div');
    icon.className = 'gift-reward-icon';
    icon.textContent = secretMatched ? '🏆' : reward.mysteryOpened ? '🎁' : '🪙';
    const title = document.createElement('strong');
    title.textContent = secretMatched ? 'تطابق الرقم الغامض!' : reward.mysteryOpened ? 'الصندوق الغامض انفتح' : 'مردود الهدية';
    const text = document.createElement('p');
    text.textContent = reward.message || `المردود: ${Number(reward.refundAmount || 0).toLocaleString('en-US')} كوينز`;
    panel.append(close, icon, title, text);
    document.body.appendChild(panel);
    close.addEventListener('click', () => panel.remove());
    setTimeout(() => panel.remove(), 7000);
  }

  function charismaIcon(charisma) { return escapeHtml(charisma?.icon || ''); }

  function renderCharisma() {
    const charisma = wallet?.charisma || {points:0, level:0, progress:0, nextMinimum:1000, nextLevel:1};
    $('charismaIcon').textContent = charismaIcon(charisma) || '⭐';
    $('charismaPoints').textContent = Number(charisma.points || 0).toLocaleString('en-US');
    $('charismaLevelLabel').textContent = `المستوى ${charisma.level || 0} • ${charisma.label || 'بدون شارة'}`;
    $('charismaProgressFill').style.width = `${Number(charisma.progress || 0)}%`;
    $('charismaProgressValue').textContent = `${Number(charisma.progress || 0)}%`;
    $('charismaNextLevel').textContent = charisma.nextMinimum ? `المستوى ${charisma.nextLevel} عند ${Number(charisma.nextMinimum).toLocaleString('en-US')}` : 'أعلى مستوى';
    $('charismaNextText').textContent = charisma.nextMinimum
      ? `تحتاج ${Number(charisma.pointsToNext || 0).toLocaleString('en-US')} كارزما للوصول إلى المستوى ${charisma.nextLevel}.`
      : 'وصلت إلى أعلى مستوى كارزما حاليًا.';
    const levels = charismaLevels.length ? charismaLevels : [{level:0,minimum:0,icon:'',label:'بدون شارة'}];
    $('charismaLevels').innerHTML = levels.map(level => `<div class="charisma-level-item ${Number(level.level) === Number(charisma.level) ? 'current' : ''}"><span class="icon">${escapeHtml(level.icon || '•')}</span><div><strong>المستوى ${Number(level.level)}</strong><small>${Number(level.minimum || 0).toLocaleString('en-US')} كارزما</small></div></div>`).join('');
  }

  function rouletteSlots() {
    return Array.isArray(rouletteState?.slots) && rouletteState.slots.length ? rouletteState.slots : DEFAULT_ROULETTE_SLOTS;
  }

  function rouletteDefinition(slotId) {
    return rouletteSlots().find(item => Number(item.slot) === Number(slotId)) || DEFAULT_ROULETTE_SLOTS.find(item => Number(item.slot) === Number(slotId)) || {slot:slotId, icon:'✨', label:`خانة ${Number(slotId) + 1}`, multiplier:1};
  }

  function rouletteBetFor(slotId) {
    return rouletteState?.slotBets?.find(item => Number(item.slot) === Number(slotId)) || rouletteDefinition(slotId);
  }

  function buildRoulette() {
    const host = $('rouletteSlots');
    const wheel = $('rouletteWheel');
    if (!host || !wheel) return;
    const definitions = rouletteSlots();
    const sector = 360 / Math.max(1, definitions.length);
    const wheelSize = wheel.clientWidth || 360;
    // Compact physical cards leave a clear angular gap between neighbouring
    // slots. They sit slightly outside the inner rim so the pointer and the
    // result remain readable even on a phone-sized wheel.
    // Keep the physical cards compact. A smaller angular footprint leaves a
    // visible gap between every neighbouring slot while the larger orbit
    // radius keeps the cards balanced around the centre and under the pointer.
    const cardWidth = Math.max(56, Math.min(94, wheelSize * 0.135));
    const cardHeight = Math.max(70, Math.min(104, wheelSize * 0.15));
    const frameHeight = Math.max(31, cardHeight * 0.44);
    const iconSize = Math.max(26, Math.min(40, wheelSize * 0.067));
    const radius = Math.max(82, wheelSize / 2 - cardHeight / 2 - 8);
    host.innerHTML = definitions.map((item, position) => {
      const slotId = Number(item.slot);
      const bet = rouletteBetFor(slotId);
      const own = rouletteState?.ownBets?.find(row => Number(row.slot) === slotId)?.amount || 0;
      const recentBet = recentRouletteBet?.slot === slotId && recentRouletteBet.until > Date.now();
      const angle = position * sector;
      const chancePercent = Number(item.chancePercent ?? 0).toLocaleString('en-US');
      const multiplier = Number(item.multiplier || 1).toLocaleString('en-US');
      const hotRank = Number(bet.hotRank || 0);
      const betSummary = own ? `رهانك ${Number(own).toLocaleString('en-US')}` : '';
      const title = `${item.label} — ×${multiplier} — ${chancePercent}%${betSummary ? ` — ${betSummary}` : ''}`;
      const ownBadge = own > 0
        ? `<span class="roulette-slot-own-bet"><i class="fa-solid fa-coins coin" aria-hidden="true"></i><b>${Number(own).toLocaleString('en-US')}</b></span>`
        : '';
      const hotBadge = hotRank > 0
        ? `<span class="roulette-slot-hot-badge">HOT ${hotRank}</span>`
        : '';
      const badges = ownBadge || hotBadge ? `<span class="roulette-slot-badges">${hotBadge}${ownBadge}</span>` : '';
      return `<div class="roulette-slot-item ${slotId === selectedSlot ? 'active' : ''} ${recentBet ? 'bet-placed' : ''}" style="width:${cardWidth.toFixed(1)}px;height:${cardHeight.toFixed(1)}px;--slot-frame-height:${frameHeight.toFixed(1)}px;--slot-icon-size:${iconSize.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${angle}deg) translateY(-${radius.toFixed(1)}px) rotate(${-angle}deg)"><button type="button" class="roulette-slot ${slotId === selectedSlot ? 'active' : ''}" data-slot="${slotId}" title="${escapeHtml(title)}">${badges}<span class="roulette-slot-frame"><span class="roulette-slot-icon">${escapeHtml(item.icon)}</span></span><span class="roulette-slot-copy"><strong>${escapeHtml(item.label)}</strong><small>×${multiplier} • ${chancePercent}%</small></span></button></div>`;
    }).join('');
    host.querySelectorAll('.roulette-slot').forEach(button => button.addEventListener('click', () => {
      const slotId = Number(button.dataset.slot);
      selectedSlot = slotId;
      if (rouletteState?.status === 'betting' && Number(selectedDenomination) > 0) {
        // The denomination is selected below the wheel; every cell press adds
        // one chip of that value to the pressed cell.
        void placeRouletteBet(selectedDenomination, slotId);
      } else {
        buildRoulette();
        renderRouletteControls();
      }
    }));
  }

  function animateWheel(winningSlot, durationMs = 5000) {
    const wheel = $('rouletteWheel');
    if (!wheel) return;
    const definitions = rouletteSlots();
    const winningPosition = Math.max(0, definitions.findIndex(item => Number(item.slot) === Number(winningSlot)));
    const sector = 360 / Math.max(1, definitions.length);
    const currentMod = ((wheelRotation % 360) + 360) % 360;
    const targetMod = ((-(winningPosition * sector)) % 360 + 360) % 360;
    wheelRotation += 360 * 7 + ((targetMod - currentMod + 360) % 360);
    wheel.style.transitionDuration = `${Math.max(250, durationMs)}ms`;
    wheel.style.setProperty('--roulette-rotation', `${wheelRotation}deg`);
  }

  function animateRouletteBet(slotId, amount) {
    recentRouletteBet = {slot: Number(slotId), amount: Number(amount), until: Date.now() + 850};
    buildRoulette();
    setTimeout(() => {
      if (recentRouletteBet?.slot !== Number(slotId) || recentRouletteBet?.amount !== Number(amount)) return;
      recentRouletteBet = null;
      buildRoulette();
    }, 900);
  }

  function formatRouletteResult(result) {
    if (!result) return 'اختَر خانة ثم ضع رقائقك قبل انتهاء الوقت.';
    if (result.kind === 'salad') return `${result.icon || '🥗'} ${result.label}: كل رهانات ${result.category === 'fruit' ? 'الفواكه' : 'اللحوم'} رابحة حسب مضاعف كل خانة.`;
    return `${result.icon || '✨'} ${result.label} — النتيجة توقفت عند هذه الخانة (x${Number(result.multiplier || 1).toLocaleString('en-US')}).`;
  }

  function renderRouletteHistories() {
    const resultsHost = $('rouletteResultsHistory');
    const winnersHost = $('rouletteWinnersHistory');
    const state = rouletteState || {};
    if (resultsHost) {
      const rows = state.recentRounds || [];
      resultsHost.innerHTML = rows.length ? rows.map(row => `<div class="roulette-history-row"><span class="roulette-history-icon">${escapeHtml(row.result?.icon || '✨')}</span><div><strong>${escapeHtml(row.result?.label || 'نتيجة')}</strong><small>${escapeHtml(formatDate(row.createdAt))} • ${Number(row.winnerCount || 0)} فائز</small></div><b>${Number(row.totalPayout || 0).toLocaleString('en-US')}</b></div>`).join('') : '<div class="empty-box">لا توجد نتائج بعد.</div>';
    }
    if (winnersHost) {
      const rows = state.recentWinners || [];
      winnersHost.innerHTML = rows.length ? rows.slice(0, 12).map(row => `<div class="roulette-history-row"><span class="roulette-history-icon">🏆</span><div><strong>@${escapeHtml(row.username || row.displayName || '')}</strong><small>${escapeHtml(row.result?.label || 'فوز')} • ${escapeHtml(formatDate(row.createdAt))}</small></div><b class="win-text">+${Number(row.payout || 0).toLocaleString('en-US')}</b></div>`).join('') : '<div class="empty-box">لم يفز أحد بعد.</div>';
    }
    const personalHost = $('roulettePersonalHistory');
    if (personalHost) {
      const rows = wallet?.rouletteHistory || [];
      personalHost.innerHTML = rows.length ? rows.slice(0, 8).map(row => `<div class="roulette-history-row"><span class="roulette-history-icon">${row.won ? '✅' : '❌'}</span><div><strong>${escapeHtml(row.result?.label || 'جولة')}</strong><small>رهان ${Number(row.totalBet || 0).toLocaleString('en-US')} • ${escapeHtml(formatDate(row.createdAt))}</small></div><b class="${row.won ? 'win-text' : 'loss-text'}">${row.net >= 0 ? '+' : ''}${Number(row.net || 0).toLocaleString('en-US')}</b></div>`).join('') : '<div class="empty-box">لا توجد رهانات مسجلة بعد.</div>';
    }
    const boardHost = $('rouletteLeaderboard');
    if (boardHost) {
      const board = state.leaderboard || [];
      boardHost.innerHTML = board.length ? board.slice(0, 5).map((row, index) => `<div class="roulette-leader-row"><span>${index + 1}</span><strong>@${escapeHtml(row.username || row.displayName || '')}</strong><small>${Number(row.wins || 0)} فوز</small><b>${Number(row.totalPayout || 0).toLocaleString('en-US')}</b></div>`).join('') : '<div class="muted">لا يوجد ترتيب لهذه الجولة بعد.</div>';
    }
  }

  function renderRouletteControls() {
    const state = rouletteState || {};
    const betting = state.status === 'betting' && Number(state.bettingEndsAt || 0) > Date.now();
    const selected = rouletteDefinition(selectedSlot);
    const resultNode = $('rouletteSelected');
    if (resultNode) resultNode.textContent = `الخانة المختارة: ${selected.icon} ${selected.label}`;
    if ($('rouletteCenterLabel')) $('rouletteCenterLabel').textContent = `${selected.icon} ${selected.label}`;
    if ($('rouletteCenterMultiplier')) $('rouletteCenterMultiplier').textContent = `×${Number(selected.multiplier || 1).toLocaleString('en-US')}`;
    const denominationHost = $('rouletteDenominations');
    const denominations = state.denominations || [20, 100, 1000, 5000];
    if (!denominations.some(value => Number(value) === Number(selectedDenomination))) selectedDenomination = Number(denominations[0] || 0);
    if (denominationHost) denominationHost.innerHTML = denominations.map(value => `<button type="button" class="roulette-denomination ${Number(value) === Number(selectedDenomination) ? 'active' : ''}" data-denomination="${Number(value)}" aria-pressed="${Number(value) === Number(selectedDenomination) ? 'true' : 'false'}" ${betting ? '' : 'disabled'}><i class="fa-solid fa-coins coin"></i> ${Number(value).toLocaleString('en-US')}</button>`).join('');
    const repeat = $('rouletteRepeatBtn');
    if (repeat) repeat.disabled = !betting || !Array.isArray(wallet?.rouletteLastBets) || !wallet.rouletteLastBets.length;
    denominationHost?.querySelectorAll('[data-denomination]').forEach(button => button.addEventListener('click', () => {
      selectedDenomination = Number(button.dataset.denomination);
      renderRouletteControls();
    }));
    if ($('rouletteSelected')) $('rouletteSelected').textContent = `الخانة المختارة: ${selected.icon} ${selected.label} • قيمة الضغطة: ${Number(selectedDenomination || 0).toLocaleString('en-US')} كوينز`;
    if ($('rouletteControlMode')) $('rouletteControlSlotLabel').classList.toggle('hidden', $('rouletteControlMode').value !== 'slot');
  }

  function renderRouletteState() {
    const state = rouletteState;
    if (!state) return;
    clearInterval(rouletteCountdownTimer);
    const statusNode = $('rouletteRoundStatus');
    const summaryNode = $('rouletteBetSummary');
    const now = Date.now();
    if (statusNode) {
      if (state.status === 'betting') {
        const remaining = Math.max(0, Math.ceil((Number(state.bettingEndsAt || 0) - now) / 1000));
        statusNode.textContent = remaining ? `المراهنة مفتوحة — باقي ${remaining} ثانية` : 'تُغلق المراهنة الآن...';
        statusNode.className = 'roulette-round-status betting';
        rouletteCountdownTimer = setInterval(() => renderRouletteState(), 1000);
      } else if (state.status === 'spinning') {
        const remaining = Math.max(0, Math.ceil((Number(state.spinEndsAt || 0) - now) / 1000));
        statusNode.textContent = remaining ? `العجلة تدور — النتيجة المشتركة بعد ${remaining} ث` : 'تم تثبيت النتيجة';
        statusNode.className = 'roulette-round-status spinning';
        rouletteCountdownTimer = setInterval(() => renderRouletteState(), 500);
      } else if (state.status === 'results') {
        const remaining = Math.max(0, Math.ceil((Number(state.resultsEndsAt || 0) - now) / 1000));
        statusNode.textContent = `نتائج الجولة — الجولة التالية بعد ${remaining} ث`;
        statusNode.className = 'roulette-round-status results';
        if ($('rouletteRoundResultsCountdown')) $('rouletteRoundResultsCountdown').textContent = String(remaining);
        rouletteCountdownTimer = setInterval(() => renderRouletteState(), 500);
      } else {
        statusNode.textContent = 'بانتظار الجولة القادمة';
        statusNode.className = 'roulette-round-status';
      }
    }
    const own = (state.ownBets || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (summaryNode) summaryNode.textContent = own
      ? `رهانك في الجولة: ${own.toLocaleString('en-US')} كوينز على ${state.ownBets.length} خانة.`
      : state.status === 'betting'
        ? `قيمة كل ضغطة: ${Number(selectedDenomination || 0).toLocaleString('en-US')} كوينز — اضغط الخانة لإضافة الرهان.`
        : 'لم تضع أي رهان في الجولة الحالية.';
    buildRoulette();
    renderRouletteControls();
    renderRouletteHistories();
    if (state.result && ['spinning', 'results'].includes(state.status)) $('rouletteResult').textContent = formatRouletteResult(state.result);
  }

  function showRouletteResults(summary, resultsEndsAt) {
    if (!summary || lastShownResultRoundId === summary.roundId) return;
    lastShownResultRoundId = summary.roundId;
    const overlay = $('rouletteRoundResultsOverlay');
    if (!overlay) return;
    const result = summary.result || {};
    $('rouletteRoundResultsIcon').textContent = result.icon || '✨';
    $('rouletteRoundResultsNumber').textContent = String(summary.roundId || summary.date || '—').replace(/^roulette[-_:]?/i, '').slice(-8);
    $('rouletteRoundResultsPayout').textContent = Number(summary.totalPayout || 0).toLocaleString('en-US');
    $('rouletteRoundResultsBet').textContent = Number(summary.totalBet || 0).toLocaleString('en-US');
    const winnersHost = $('rouletteRoundResultsWinners');
    const winners = Array.isArray(summary.winners) ? summary.winners.slice(0, 3) : [];
    winnersHost.innerHTML = winners.length ? winners.map((row, index) => {
      const name = row.displayName || row.username || 'مستخدم';
      const avatar = row.avatar
        ? `<img src="${escapeHtml(row.avatar)}" alt="${escapeHtml(name)}">`
        : `<span>${escapeHtml(String(name).trim().slice(0, 1) || '👤')}</span>`;
      const medal = ['🥇', '🥈', '🥉'][index];
      return `<article class="roulette-round-winner"><span class="roulette-winner-medal">${medal}</span><div class="roulette-winner-avatar">${avatar}</div><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><small>@${escapeHtml(row.username || '')}</small><b>+${Number(row.payout || 0).toLocaleString('en-US')} <i class="fa-solid fa-coins coin" aria-hidden="true"></i></b></article>`;
    }).join('') : '<div class="roulette-no-winners">ماكو فائزين في هذه الجولة.</div>';
    overlay.classList.remove('hidden');
    clearTimeout(rouletteResultsAutoCloseTimer);
    const fallbackEnd = Date.now() + 5_000;
    const remaining = Math.max(0, Number(resultsEndsAt || fallbackEnd) - Date.now());
    rouletteResultsAutoCloseTimer = setTimeout(() => overlay.classList.add('hidden'), remaining);
  }

  function applyRouletteState(incoming, {authoritativeOwnBets = false} = {}) {
    if (!incoming) return;
    const previous = rouletteState;
    const next = {...incoming};
    if (!authoritativeOwnBets && (!Array.isArray(next.ownBets) || !next.ownBets.length) && previous?.roundId === next.roundId && previous.ownBets?.length) next.ownBets = previous.ownBets;
    const slotsChanged = JSON.stringify((previous?.slots || []).map(item => [item.slot, item.icon, item.label, item.multiplier])) !== JSON.stringify((next.slots || []).map(item => [item.slot, item.icon, item.label, item.multiplier]));
    rouletteState = next;
    if (slotsChanged) {
      wheelRotation = 0;
      $('rouletteWheel')?.style.setProperty('--roulette-rotation', '0deg');
    }
    if (previous?.roundId !== next.roundId && next.status === 'betting') {
      lastAnimatedRoundId = '';
      lastShownResultRoundId = '';
      clearTimeout(rouletteResultsAutoCloseTimer);
      $('rouletteRoundResultsOverlay')?.classList.add('hidden');
    }
    if (slotsChanged || !previous) buildRoulette();
    renderRouletteState();
    if (next.status === 'spinning' && next.result && lastAnimatedRoundId !== next.roundId) {
      lastAnimatedRoundId = next.roundId;
      const remaining = Math.max(300, Number(next.spinEndsAt || 0) - Date.now());
      animateWheel(next.result.displaySlot ?? next.result.slot ?? 0, remaining);
      setTimeout(() => { if (rouletteState?.roundId !== next.roundId) return; $('rouletteResult').textContent = formatRouletteResult(next.result); }, remaining + 40);
    }
    if (next.status === 'results' && next.roundSummary) showRouletteResults(next.roundSummary, next.resultsEndsAt);
  }

  function connectRouletteSocket() {
    if (typeof io !== 'function') return;
    rouletteSocket = io({transports:['websocket','polling']});
    rouletteSocket.on('connect', () => {
      pendingRouletteBets = 0;
      rouletteSocket.emit('roulette:subscribe');
    });
    // roulette:state is also broadcast to the whole room without private
    // bets. Never let that privacy-safe snapshot erase the local user's
    // visible chips; the bet-result/API response remains authoritative for
    // the bettor and the next round naturally clears them.
    ['roulette:state', 'roulette:round-started', 'roulette:spin-started', 'roulette:results-started', 'roulette:control-updated'].forEach(eventName => rouletteSocket.on(eventName, state => applyRouletteState(state, {authoritativeOwnBets:false})));
    rouletteSocket.on('roulette:bet-result', result => {
      if (!result?.success) {
        pendingRouletteBets = 0;
        showToast(result?.error || 'تعذر وضع الرهان', true);
        void resyncRouletteAfterBetFailure();
        return;
      }
      pendingRouletteBets = Math.max(0, pendingRouletteBets - 1);
      if (result.wallet) { wallet = result.wallet; renderWallet(); }
      if (result.state) applyRouletteState(result.state, {authoritativeOwnBets:true});
    });
    rouletteSocket.on('roulette:daily-awards', award => { if (award?.winners?.length) showToast(`تم توزيع جوائز اليوم على ${award.winners.length} فائز`); });
    rouletteSocket.on('wallet-updated', data => { if (data?.username && data.username === wallet?.username) { wallet = data; renderWallet(); renderRouletteState(); } });
    rouletteSocket.on('economy-shop-updated', data => { if (!data?.item?.itemId) return; shopItems = shopItems.map(item => item.itemId === data.item.itemId ? data.item : item); renderShop(); });
    rouletteSocket.on('connect_error', () => showToast('تعذر الاتصال بسيرفر العجلة، أعد المحاولة بعد لحظة', true));
  }

  function addOptimisticRouletteBet(slotId, amount) {
    if (!rouletteState || rouletteState.status !== 'betting') return;
    if (!Array.isArray(rouletteState.ownBets)) rouletteState.ownBets = [];
    const slot = Number(slotId);
    const value = Number(amount);
    const existing = rouletteState.ownBets.find(row => Number(row.slot) === slot);
    if (existing) existing.amount = Number(existing.amount || 0) + value;
    else rouletteState.ownBets.push({ slot, amount: value });
    pendingRouletteBets += 1;
    // Paint the chip locally before the round-trip to the server. The server
    // state still replaces this optimistic value as soon as the acknowledgement
    // arrives, so a rejected bet cannot remain visible.
    buildRoulette();
    renderRouletteControls();
    renderRouletteState();
  }

  async function resyncRouletteAfterBetFailure() {
    try {
      const [me, state] = await Promise.all([
        request('/api/economy/me'),
        request('/api/economy/roulette/state')
      ]);
      if (me?.wallet) wallet = me.wallet;
      if (state?.state) applyRouletteState(state.state, {authoritativeOwnBets:true});
      else renderWallet();
    } catch (_) {}
  }

  async function placeRouletteBet(denomination, slotId = selectedSlot) {
    if (!rouletteState || rouletteState.status !== 'betting') return showToast('انتظر بداية المراهنة', true);
    const amount = Number(denomination);
    const targetSlot = Number(slotId);
    selectedSlot = targetSlot;
    addOptimisticRouletteBet(targetSlot, amount);
    renderRouletteControls();
    animateRouletteBet(targetSlot, amount);
    if (rouletteSocket?.connected) return rouletteSocket.emit('roulette:bet', {slot:targetSlot, denomination:amount});
    try { const data = await request('/api/economy/roulette/bet', {method:'POST', body:JSON.stringify({slot:targetSlot, denomination:amount})}); pendingRouletteBets = Math.max(0, pendingRouletteBets - 1); wallet = data.wallet || wallet; renderWallet(); applyRouletteState(data.state, {authoritativeOwnBets:true}); }
    catch (error) { pendingRouletteBets = 0; showToast(error.message, true); await resyncRouletteAfterBetFailure(); }
  }

  async function repeatRouletteBet() {
    if (!wallet?.rouletteLastBets?.length) return showToast('لا يوجد رهان محفوظ للتكرار', true);
    if (rouletteSocket?.connected) return rouletteSocket.emit('roulette:repeat');
    try { const data = await request('/api/economy/roulette/repeat', {method:'POST', body:'{}'}); wallet = data.wallet || wallet; renderWallet(); applyRouletteState(data.state, {authoritativeOwnBets:true}); }
    catch (error) { showToast(error.message, true); }
  }

  function renderShop() {
    const host = $('shopGrid');
    if (!shopItems.length) { host.innerHTML = '<div class="empty-box">المتجر فارغ حاليًا.</div>'; return; }
    host.innerHTML = shopItems.map(item => `<article class="shop-item" data-item-id="${escapeHtml(item.itemId)}"><div class="item-visual">${itemVisual(item)}</div><div class="item-name">${escapeHtml(item.name)}</div><div class="item-description">${escapeHtml(item.description || 'عنصر من متجر TOMI')}${item.type === 'gift' ? `<br><span class="charisma-mini"><span class="charisma-mini-icon">⭐</span> +${Number(item.charismaValue || 1).toLocaleString('en-US')} كارزما للمستلم</span>` : ''}${item.itemId === 'gift_king' ? `<br><span class="gift-jackpot"><i class="fa-solid fa-box-open"></i> الصندوق المتراكم: ${Number(item.jackpotAmount || 0).toLocaleString('en-US')} كوينز</span><br><span class="gift-mystery-range"><i class="fa-solid fa-dice"></i> الرقم الغامض لهذه الجولة: ${Number(item.mysteryRange?.min || 151).toLocaleString('en-US')}–${Number(item.mysteryRange?.max || 300).toLocaleString('en-US')}</span>` : ''}</div><div class="shop-action-row"><label class="shop-quantity-label">العدد<input class="input shop-quantity" type="number" min="1" max="100" value="1" data-item-id="${escapeHtml(item.itemId)}" inputmode="numeric"></label><span class="price"><i class="fa-solid fa-coins coin"></i> ${Number(item.price || 0).toLocaleString('en-US')} للحبة</span></div>${item.type === 'gift' ? `<div class="shop-gift-actions"><button class="primary buy-btn" type="button" data-item-id="${escapeHtml(item.itemId)}"><i class="fa-solid fa-wallet"></i> شراء للمحفظة</button><button class="secondary send-self-btn" type="button" data-item-id="${escapeHtml(item.itemId)}"><i class="fa-solid fa-user"></i> إرسال لنفسي</button><button class="secondary send-friend-btn" type="button" data-item-id="${escapeHtml(item.itemId)}"><i class="fa-solid fa-user-plus"></i> إرسال لصديق</button></div>` : `<div class="item-footer"><button class="primary buy-btn" type="button" data-item-id="${escapeHtml(item.itemId)}">شراء</button></div>`}</article>`).join('');
  }

  function renderInventory() {
    const host = $('inventoryGrid');
    const items = wallet?.inventory || [];
    if (!items.length) { host.innerHTML = '<div class="empty-box">لم تشترِ أي عنصر بعد. ابدأ من المتجر.</div>'; return; }
    const grouped = [];
    const byKey = new Map();
    items.forEach(item => {
      const key = item.type === 'gift' ? `gift:${item.itemId || item.name}` : `item:${item.inventoryId}`;
      if (!byKey.has(key)) { const group = { ...item, count: 0 }; byKey.set(key, group); grouped.push(group); }
      byKey.get(key).count += 1;
    });
    host.innerHTML = grouped.map(item => `<article class="inventory-item"><div class="item-visual">${itemVisual(item)}</div><div class="item-name">${escapeHtml(item.name)}${item.type === 'gift' && item.count > 1 ? ` <span class="gift-count-badge">×${Number(item.count).toLocaleString('en-US')}</span>` : ''}</div><div class="item-description">${escapeHtml(item.description || '')}${item.type === 'gift' ? `<br><small>العدد في المحفظة: ${Number(item.count).toLocaleString('en-US')}</small>` : `<br><small>تم الشراء: ${escapeHtml(formatDate(item.purchasedAt))}</small>`}</div><div class="item-footer">${item.type === 'frame' && item.frameId ? `<button class="primary equip-btn" type="button" data-frame-id="${escapeHtml(item.frameId)}">ارتداء الإطار</button>` : item.type === 'gift' ? `<button class="secondary send-item-btn" type="button" data-item-id="${escapeHtml(item.itemId)}" data-quantity="${Number(item.count)}">اختيار للإرسال</button>` : `<span class="muted"><i class="fa-solid ${escapeHtml(item.icon || 'fa-gift')}"></i> محفوظ</span>`}</div></article>`).join('');
  }

  function renderHistory() {
    const host = $('historyList');
    const rows = wallet?.transactions || [];
    if (!rows.length) { host.innerHTML = '<div class="empty-box">لا توجد عمليات بعد.</div>'; return; }
    host.innerHTML = rows.map(row => `<div class="history-row"><i class="fa-solid ${row.delta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i><div><strong>${escapeHtml(row.reason || row.type || 'عملية')}</strong><small>${escapeHtml(formatDate(row.createdAt))}</small></div><span class="delta ${row.delta >= 0 ? 'plus' : 'minus'}">${row.delta >= 0 ? '+' : ''}${Number(row.delta || 0).toLocaleString('en-US')}</span></div>`).join('');
  }

  function renderGiftOptions() {
    const select = $('giftInventorySelect');
    const gifts = (wallet?.inventory || []).filter(item => item.type === 'gift' && item.transferable !== false);
    const grouped = new Map();
    gifts.forEach(item => {
      const key = item.itemId || item.name;
      if (!grouped.has(key)) grouped.set(key, {item, count: 0});
      grouped.get(key).count += 1;
    });
    select.innerHTML = grouped.size ? `<option value="">اختَر الهدية</option>${[...grouped.values()].map(({item, count}) => `<option value="${escapeHtml(item.itemId || '')}">${escapeHtml(item.name)} ×${Number(count).toLocaleString('en-US')} (+${Number(item.charismaValue || 1).toLocaleString('en-US')} كارزما للحبة)</option>`).join('')}` : '<option value="">لا توجد هدايا قابلة للإرسال</option>';
    select.disabled = !gifts.length;
    $('giftQuantity').disabled = !gifts.length;
    $('giftRecipientMode').disabled = !gifts.length;
    $('sendGiftBtn').disabled = !gifts.length;
    syncGiftRecipientMode(gifts.length > 0);
    $('giftSendHint').textContent = gifts.length ? 'يمكنك تحديد العدد وإرسال عدة هدايا من النوع نفسه في عملية واحدة.' : 'اشترِ هدية للمحفظة أولاً أو استخدم الإرسال المباشر من المتجر.';
  }

  function syncGiftRecipientMode(hasGifts = Boolean((wallet?.inventory || []).some(item => item.type === 'gift' && item.transferable !== false))) {
    const toUser = $('giftRecipientMode').value === 'user';
    $('giftRecipientWrap').classList.toggle('hidden', !toUser);
    $('giftRecipient').required = toUser;
    $('giftRecipient').disabled = !hasGifts || !toUser;
  }

  function renderReceivedGifts() {
    const host = $('receivedGiftsList');
    const gifts = wallet?.receivedGifts || [];
    if (!gifts.length) { host.innerHTML = '<div class="empty-box">لا توجد هدايا مستلمة بعد.</div>'; return; }
    const grouped = new Map();
    gifts.forEach(gift => {
      const key = gift.itemId || gift.name || 'gift';
      if (!grouped.has(key)) grouped.set(key, {gift, count: 0, charisma: 0, senders: new Set(), latest: gift.sentAt});
      const group = grouped.get(key);
      group.count += 1;
      group.charisma += Number(gift.charismaValue || 0);
      if (gift.fromUsername) group.senders.add(gift.fromUsername);
      if (Date.parse(gift.sentAt || 0) > Date.parse(group.latest || 0)) group.latest = gift.sentAt;
    });
    host.innerHTML = [...grouped.values()].map(group => {
      const senders = [...group.senders];
      const senderText = senders.length === 1 ? `من @${senders[0]}` : `من ${senders.length || 1} مستخدمين`;
      return `<div class="received-gift"><div class="received-gift-icon">${giftVisual(group.gift)}</div><div class="received-gift-copy"><strong>${escapeHtml(group.gift.name)} <span class="gift-count-badge">×${Number(group.count).toLocaleString('en-US')}</span></strong><small>${senderText} • إجمالي +${Number(group.charisma).toLocaleString('en-US')} كارزما</small><small>آخر إرسال: ${escapeHtml(formatDate(group.latest))}</small></div></div>`;
    }).join('');
  }

  function renderDaily() {
    const daily = wallet?.daily || {};
    const button = $('claimDailyBtn');
    if (daily.claimed) { $('dailyStatus').textContent = `تمت إضافة ${daily.amount} كوينز اليوم`; $('dailyHint').textContent = 'ارجع غدًا لتحصل على المكافأة الجديدة.'; }
    else if (daily.available) { $('dailyStatus').textContent = 'مكافأتك اليومية جاهزة'; $('dailyHint').textContent = 'اضغط استلام حتى تضاف 500 كوينز إلى رصيدك.'; }
    else { $('dailyStatus').textContent = 'استلمت مكافأتك اليومية'; $('dailyHint').textContent = 'المكافأة القادمة في اليوم الجديد.'; }
    button.disabled = !daily.available;
    button.style.opacity = button.disabled ? '.55' : '1';
  }

  function renderWallet() {
    setBalance(wallet?.coins || 0);
    renderCharisma(); renderDaily(); renderInventory(); renderGiftOptions(); renderReceivedGifts(); renderHistory();
  }

  async function loadAdminItems() {
    try {
      const data = await request('/api/economy/admin/items');
      const host = $('adminItems');
      const items = data.items || [];
      host.innerHTML = items.length ? items.map(item => `<div class="admin-item"><span class="admin-item-visual">${itemVisual(item)}</span><span class="admin-item-name">${escapeHtml(item.name)}${item.animated ? ' • متحرك' : ''}</span><input class="input admin-edit-icon" value="${escapeHtml(item.icon || 'fa-gift')}" data-item-id="${escapeHtml(item.itemId)}" aria-label="أيقونة العنصر"><input class="input admin-edit-price" type="number" min="0" value="${Number(item.price || 0)}" data-item-id="${escapeHtml(item.itemId)}" aria-label="سعر العنصر"><input class="input admin-edit-charisma" type="number" min="1" value="${Number(item.charismaValue || 1)}" data-item-id="${escapeHtml(item.itemId)}" aria-label="كارزما الهدية" ${item.type === 'gift' ? '' : 'disabled'}><input class="input admin-edit-image" type="url" value="${escapeHtml(item.imageUrl || '')}" data-item-id="${escapeHtml(item.itemId)}" aria-label="رابط صورة الهدية">${item.itemId === 'gift_king' ? `<input class="input admin-edit-secret" type="number" min="1" max="${Number(item.price || 1)}" value="${Number(item.kingSecretNumber || 1)}" data-item-id="${escapeHtml(item.itemId)}" aria-label="الرقم الغامض" placeholder="الرقم الغامض" title="رقم الفوز السري (من 1 إلى سعر الهدية)"><small class="muted admin-jackpot">الصندوق: ${Number(item.jackpotAmount || 0).toLocaleString('en-US')} كوينز</small>` : ''}<label class="admin-edit-check"><input class="admin-edit-animated" type="checkbox" data-item-id="${escapeHtml(item.itemId)}" ${item.animated ? 'checked' : ''}> متحرك</label><small class="muted">${item.active === false ? 'متوقف' : 'فعال'}</small><button class="secondary save-item" data-item-id="${escapeHtml(item.itemId)}">حفظ</button><button class="secondary toggle-item" data-item-id="${escapeHtml(item.itemId)}" data-active="${item.active !== false}">${item.active === false ? 'تفعيل' : 'إيقاف'}</button></div>`).join('') : '<div class="empty-box">لا توجد عناصر.</div>';
    } catch (error) { showToast(error.message, true); }
  }

  function fillOwnerRouletteControl() {
    const select = $('rouletteControlSlot');
    if (!select) return;
    select.innerHTML = rouletteSlots().map(item => `<option value="${Number(item.slot)}">${escapeHtml(item.icon)} ${escapeHtml(item.label)}</option>`).join('');
    const control = rouletteState?.rouletteControl;
    if (control?.mode) $('rouletteControlMode').value = control.mode;
    if (control?.slot != null) select.value = String(control.slot);
    $('rouletteControlSlotLabel').classList.toggle('hidden', $('rouletteControlMode').value !== 'slot');
  }

  async function load() {
    try {
      const [me, shop] = await Promise.all([request('/api/economy/me'), request('/api/economy/shop')]);
      wallet = me.wallet;
      charismaLevels = me.charismaLevels || [];
      rouletteState = me.rouletteState || {status:'waiting', slots:me.rouletteSlots || DEFAULT_ROULETTE_SLOTS, denominations:[20,100,1000,5000], ownBets:[]};
      shopItems = shop.items || [];
      selectedSlot = Number(rouletteState.slots?.[0]?.slot ?? 0);
      buildRoulette(); renderWallet(); renderRouletteState(); renderShop();
      $('ownerPanel').classList.toggle('hidden', !me.isOwner);
      if (me.isOwner) { fillOwnerRouletteControl(); loadAdminItems(); }
      if (!rouletteSocket) connectRouletteSocket();
    } catch (error) { showToast(error.message, true); }
  }

  async function claimDaily() {
    try { const data = await request('/api/economy/daily-claim', {method:'POST', body:'{}'}); wallet = data.wallet; renderWallet(); showToast(data.claimed ? 'تمت إضافة 500 كوينز إلى رصيدك' : 'استلمت مكافأتك اليومية مسبقًا'); }
    catch (error) { showToast(error.message, true); }
  }

  async function buy(itemId, quantity = 1) {
    const safeQuantity = Math.max(1, Math.min(100, Number(quantity) || 1));
    try { const data = await request('/api/economy/shop/purchase', {method:'POST', body:JSON.stringify({itemId, quantity:safeQuantity})}); wallet = data.wallet; if (data.shopItem) { shopItems = shopItems.map(item => item.itemId === data.shopItem.itemId ? data.shopItem : item); renderShop(); } renderWallet(); showToast(data.message || 'تم الشراء'); }
    catch (error) { showToast(error.message, true); }
  }

  async function sendDirect(itemId, recipientMode, quantity = 1, toUsername = '') {
    const safeQuantity = Math.max(1, Math.min(100, Number(quantity) || 1));
    try {
      // Direct sending still records every gift as a normal purchase first;
      // this keeps the wallet, jackpot pool, refunds, and audit history in
      // sync with gifts bought for later use.
      const purchase = await request('/api/economy/shop/purchase', {method:'POST', body:JSON.stringify({itemId, quantity:safeQuantity})});
      wallet = purchase.wallet || wallet;
      const data = await request('/api/economy/gifts/send', {method:'POST', body:JSON.stringify({itemId, quantity:safeQuantity, recipientMode, toUsername})});
      wallet = data.wallet || wallet;
      renderWallet();
      showToast(data.message || 'تم إرسال الهدايا');
      showGiftReward(data);
    } catch (error) { showToast(error.message, true); renderWallet(); }
  }

  async function equip(frameId) {
    try { const data = await request('/api/economy/equip-frame', {method:'POST', body:JSON.stringify({frameId})}); wallet = data.wallet; renderWallet(); showToast('تم ارتداء الإطار وسيظهر في الدردشة والغرف الصوتية'); }
    catch (error) { showToast(error.message, true); }
  }

  $('shopGrid').addEventListener('click', event => {
    const button = event.target.closest('.buy-btn, .send-self-btn, .send-friend-btn');
    if (!button) return;
    const card = button.closest('.shop-item');
    const quantity = Math.max(1, Math.min(100, Number(card?.querySelector('.shop-quantity')?.value || 1)));
    const itemId = button.dataset.itemId;
    if (button.classList.contains('buy-btn')) return buy(itemId, quantity);
    if (button.classList.contains('send-self-btn')) return sendDirect(itemId, 'self', quantity, wallet?.username || '');
    const toUsername = window.prompt('اكتب اسم صديقك لإرسال الهدية:')?.trim();
    if (toUsername) sendDirect(itemId, 'user', quantity, toUsername);
  });
  $('inventoryGrid').addEventListener('click', event => {
    const equipButton = event.target.closest('.equip-btn');
    if (equipButton) return equip(equipButton.dataset.frameId);
    const sendButton = event.target.closest('.send-item-btn');
    if (sendButton) { $('giftInventorySelect').value = sendButton.dataset.itemId || ''; $('giftQuantity').value = sendButton.dataset.quantity || 1; $('giftRecipientMode').value = 'user'; syncGiftRecipientMode(); $('giftRecipient').focus(); $('giftTransferCard')?.scrollIntoView?.({behavior:'smooth', block:'center'}); }
  });
  $('claimDailyBtn').addEventListener('click', claimDaily);
  $('refreshBtn').addEventListener('click', load);
  $('rouletteRepeatBtn').addEventListener('click', repeatRouletteBet);
  $('rouletteRoundResultsClose').addEventListener('click', () => $('rouletteRoundResultsOverlay').classList.add('hidden'));
  $('rouletteControlMode').addEventListener('change', () => $('rouletteControlSlotLabel').classList.toggle('hidden', $('rouletteControlMode').value !== 'slot'));
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('logoutBtn').addEventListener('click', async () => { await request('/api/logout', {method:'POST', body:'{}'}).catch(() => {}); location.replace('login.html'); });

  $('sendGiftForm').addEventListener('submit', async event => {
    event.preventDefault();
    const itemId = $('giftInventorySelect').value;
    const quantity = Math.max(1, Math.min(100, Number($('giftQuantity').value || 1)));
    const recipientMode = $('giftRecipientMode').value;
    const toUsername = recipientMode === 'self' ? wallet?.username : $('giftRecipient').value.trim();
    if (!itemId || (recipientMode === 'user' && !toUsername)) return showToast('اختَر نوع الهدية واكتب اسم المستلم', true);
    $('sendGiftBtn').disabled = true;
    try { const data = await request('/api/economy/gifts/send', {method:'POST', body:JSON.stringify({itemId, quantity, recipientMode, toUsername})}); wallet = data.wallet; renderWallet(); $('giftRecipient').value = ''; $('giftQuantity').value = 1; showToast(data.message || 'تم إرسال الهدية'); showGiftReward(data); }
    catch (error) { showToast(error.message, true); }
    finally { $('sendGiftBtn').disabled = !(wallet?.inventory || []).some(item => item.type === 'gift' && item.transferable !== false); }
  });

  $('giftRecipientMode').addEventListener('change', () => {
    if ($('giftRecipientMode').value === 'self') $('giftRecipient').value = '';
    syncGiftRecipientMode();
    if ($('giftRecipientMode').value === 'user') $('giftRecipient').focus();
  });

  let recipientTimer = null;
  $('giftRecipient').addEventListener('input', () => {
    clearTimeout(recipientTimer);
    const query = $('giftRecipient').value.trim();
    if (query.length < 1) { $('giftRecipientOptions').innerHTML = ''; return; }
    recipientTimer = setTimeout(async () => {
      try { const data = await request('/api/economy/users?q=' + encodeURIComponent(query)); $('giftRecipientOptions').innerHTML = (data.users || []).map(user => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.displayName || user.username)} • كارزما ${Number(user.charisma?.points || 0).toLocaleString('en-US')}</option>`).join(''); } catch (_) {}
    }, 250);
  });

  $('grantForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await request('/api/economy/admin/grant', {method:'POST', body:JSON.stringify({username:$('grantUser').value.trim(), amount:Number($('grantAmount').value), reason:$('grantReason').value.trim()})}); showToast(`تم إرسال ${data.granted} كوينز إلى ${data.username}`); }
    catch (error) { showToast(error.message, true); }
  });
  $('grantCharismaForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await request('/api/economy/admin/grant-charisma', {method:'POST', body:JSON.stringify({username:$('grantCharismaUser').value.trim(), amount:Number($('grantCharismaAmount').value), reason:$('grantCharismaReason').value.trim()})}); showToast(`تم إرسال ${Number(data.granted).toLocaleString('en-US')} كارزما إلى ${data.username}`); event.target.reset(); }
    catch (error) { showToast(error.message, true); }
  });
  $('withdrawAsset').addEventListener('change', () => {
    const asset = $('withdrawAsset').value;
    $('withdrawAmountLabel').firstChild.textContent = asset === 'charisma' ? 'عدد الكارزما' : 'عدد الكوينز';
    $('withdrawAmount').max = asset === 'charisma' ? '100000000' : '9000000000';
  });
  $('withdrawForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await request('/api/economy/admin/withdraw', {method:'POST', body:JSON.stringify({username:$('withdrawUser').value.trim(), asset:$('withdrawAsset').value, amount:Number($('withdrawAmount').value), reason:$('withdrawReason').value.trim()})});
      if (data.wallet?.username === wallet?.username) { wallet = data.wallet; renderWallet(); }
      const label = data.asset === 'charisma' ? 'كارزما' : 'كوينز';
      showToast(`تم سحب ${Number(data.withdrawn).toLocaleString('en-US')} ${label} من ${data.username}`);
      event.target.reset();
      $('withdrawAsset').dispatchEvent(new Event('change'));
    } catch (error) { showToast(error.message, true); }
  });
  $('rouletteControlForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await request('/api/economy/admin/roulette-control', {method:'POST', body:JSON.stringify({mode:$('rouletteControlMode').value, slot:Number($('rouletteControlSlot').value)})}); applyRouletteState(data.state); fillOwnerRouletteControl(); showToast('تم حفظ تحكم العجلة للجولة القادمة'); }
    catch (error) { showToast(error.message, true); }
  });
  $('resetForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await request('/api/economy/admin/reset-password', {method:'POST', body:JSON.stringify({username:$('resetUser').value.trim(), newPassword:$('resetPassword').value})}); showToast(data.message); event.target.reset(); }
    catch (error) { showToast(error.message, true); }
  });
  $('itemForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await request('/api/economy/admin/items', {method:'POST', body:JSON.stringify({name:$('itemName').value.trim(), type:$('itemType').value, price:Number($('itemPrice').value), charismaValue:Number($('itemCharisma').value || 1), frameId:$('itemFrameId').value.trim(), icon:$('itemIcon').value.trim(), imageUrl:$('itemImageUrl').value.trim(), animated:$('itemAnimated').checked, description:$('itemDescription').value.trim()})});
      shopItems.unshift(data.item); renderShop(); event.target.reset(); showToast('تمت إضافة العنصر للمتجر'); loadAdminItems();
    } catch (error) { showToast(error.message, true); }
  });
  $('adminItems').addEventListener('click', async event => {
    const saveButton = event.target.closest('.save-item');
    if (saveButton) {
      const itemId = saveButton.dataset.itemId;
      const findAdminField = className => [...document.querySelectorAll(`.${className}`)].find(node => node.dataset.itemId === itemId);
      const price = findAdminField('admin-edit-price');
      const charisma = findAdminField('admin-edit-charisma');
      const icon = findAdminField('admin-edit-icon');
      const image = findAdminField('admin-edit-image');
      const animated = findAdminField('admin-edit-animated');
      const secret = findAdminField('admin-edit-secret');
      const payload = {icon:icon?.value || 'fa-gift', price:Number(price?.value || 0), charismaValue:Number(charisma?.value || 1), imageUrl:image?.value || '', animated:Boolean(animated?.checked)};
      if (secret) payload.kingSecretNumber = Number(secret.value || 0);
      try { await request('/api/economy/admin/items/' + encodeURIComponent(itemId), {method:'PATCH', body:JSON.stringify(payload)}); await load(); showToast(secret ? 'تم حفظ الرقم الغامض وسعر وشكل الهدية' : 'تم حفظ سعر وكارزما وشكل الهدية'); }
      catch (error) { showToast(error.message, true); }
      return;
    }
    const button = event.target.closest('.toggle-item'); if (!button) return;
    try { await request('/api/economy/admin/items/' + encodeURIComponent(button.dataset.itemId), {method:'PATCH', body:JSON.stringify({active:button.dataset.active !== 'true'})}); await load(); showToast('تم تحديث حالة العنصر'); }
    catch (error) { showToast(error.message, true); }
  });

  load();
})();
