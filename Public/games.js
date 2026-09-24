(() => {
  const $ = id => document.getElementById(id);
  let me = null;
  let catalog = [];
  let friends = [];
  let rooms = [];
  let currentRoom = null;
  let privateActionText = '';
  let socket = null;
  let toastTimer = null;
  let countdownTimer = null;
  let dominoPrivate = null;
  let dominoSelectedTileId = '';
  let unoPrivate = null;
  let unoSelectedCardId = '';
  let jackarooPrivate = null;
  let jackarooSelectedCardId = '';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const icon = value => String(value || 'fa-gamepad').replace(/[^a-z0-9-]/gi, '');

  function toast(message, error = false) {
    const node = $('toast'); node.textContent = message; node.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.className = 'toast', 3200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) { location.replace('login.html'); throw new Error(data.error || 'انتهت الجلسة'); }
    if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب');
    return data;
  }

  function profileAvatar(profile, sizeClass = '') {
    const name = profile?.displayName || profile?.username || '?';
    if (profile?.avatar) return `<img class="player-avatar ${sizeClass}" src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(name)}">`;
    return `<span class="player-avatar ${sizeClass}">${escapeHtml(name.slice(0, 2).toUpperCase())}</span>`;
  }

  function charismaBadge(profile) {
    const charisma = profile?.charisma;
    if (!charisma) return '';
    return `<span class="game-charisma" title="${escapeHtml(charisma.points || 0)} كارزما">${escapeHtml(charisma.icon || '✨')} ${Number(charisma.level || 0)}</span>`;
  }

  function choiceIcon(choice) {
    return ({'حجر':'✊','ورق':'✋','مقص':'✌️','صورة':'🪙','كتابة':'✍️','زوجي':'2️⃣','فردي':'1️⃣'}[choice] || '🎲');
  }

  function selectedSpec() { return catalog.find(item => item.id === $('gameType')?.value) || catalog[0] || null; }

  function renderCatalog() {
    const host = $('catalogList');
    if (!catalog.length) { host.innerHTML = '<div class="empty-box">لا توجد ألعاب مضافة.</div>'; return; }
    host.innerHTML = catalog.map((game, index) => `<button class="game-card ${index === 0 ? 'selected' : ''}" type="button" data-game-type="${escapeHtml(game.id)}"><div class="game-card-head"><i class="fa-solid ${icon(game.icon)}"></i><h3>${escapeHtml(game.name)}</h3></div><p>${escapeHtml(game.description)}</p><div class="players-capacity">${game.allowedPlayers.join(' أو ')} لاعبين</div></button>`).join('');
    const first = catalog[0];
    updateSelectedGame(first?.id);
  }

  function updateSelectedGame(gameType) {
    const game = catalog.find(item => item.id === gameType) || catalog[0];
    if (!game) return;
    document.querySelectorAll('.game-card').forEach(card => card.classList.toggle('selected', card.dataset.gameType === game.id));
    $('createGameForm').dataset.gameType = game.id;
    const select = $('maxPlayers');
    const labels = { 2: 'لاعبان', 3: 'ثلاثة لاعبين', 4: 'أربعة لاعبين', 5: 'خمسة لاعبين', 6: 'ستة لاعبين', 7: 'سبعة لاعبين', 8: 'ثمانية لاعبين' };
    select.innerHTML = game.allowedPlayers.map(value => `<option value="${value}">${labels[value] || `${value} لاعبين`}</option>`).join('');
  }

  function renderRooms() {
    const host = $('roomsList');
    if (!rooms.length) { host.innerHTML = '<div class="empty-box">لا توجد غرف مفتوحة. أنشئ أول غرفة.</div>'; return; }
    host.innerHTML = rooms.map(room => `<button class="game-room-card" type="button" data-room-id="${escapeHtml(room.roomId)}"><div class="room-card-copy"><strong><i class="fa-solid ${icon(room.gameIcon)}"></i> ${escapeHtml(room.name)}</strong><small>${escapeHtml(room.gameName)} • المالك: ${escapeHtml(room.owner)}</small></div><span class="room-count">${room.players.length}/${room.maxPlayers}</span><i class="fa-solid fa-chevron-left"></i></button>`).join('');
  }

  function renderInvites(invites = []) {
    const host = $('invitesList');
    if (!invites.length) { host.innerHTML = '<div class="empty-box">لا توجد دعوات.</div>'; return; }
    host.innerHTML = invites.map(invite => `<div class="game-room-card"><div class="room-card-copy"><strong>${escapeHtml(invite.room?.name || 'غرفة لعب')}</strong><small>${escapeHtml(invite.invitedBy)} دعاك إلى ${escapeHtml(invite.room?.gameName || 'لعبة')}</small></div><button class="primary accept-invite" type="button" data-room-id="${escapeHtml(invite.roomId)}">انضمام</button></div>`).join('');
  }

  function playerName(username) {
    // Some board helpers receive a full player profile while the server game
    // state stores usernames.  Normalising both shapes avoids the visible
    // "[object Object]" labels that appeared on the Jackaroo home lanes.
    const key = typeof username === 'object' ? username?.username : username;
    return currentRoom?.players?.find(player => player.username === key)?.displayName
      || (typeof username === 'object' ? (username?.displayName || key) : key)
      || 'لاعب';
  }

  function playerCardsHtml() {
    return (currentRoom?.players || []).map(player => {
      const privateCount = currentRoom?.advanced === 'dominoes'
        ? { value: Number(currentRoom.domino?.handCounts?.[player.username] || 0), label: 'أحجار' }
        : currentRoom?.advanced === 'uno'
          ? { value: Number(currentRoom.uno?.handCounts?.[player.username] || 0), label: 'بطاقات' }
          : currentRoom?.advanced === 'jackaroo'
            ? { value: Number(currentRoom.jackaroo?.handCounts?.[player.username] || 0), label: 'بطاقات' }
          : null;
      const countText = privateCount != null && currentRoom.status === 'playing' ? ` • ${privateCount.value} ${privateCount.label}` : '';
      return `<div class="player-card">${profileAvatar(player)}<div class="player-copy"><strong>${escapeHtml(player.displayName || player.username)}${charismaBadge(player)}</strong><small>@${escapeHtml(player.username)}${player.isOnline ? ' • متصل' : ''}${countText}</small></div><span class="ready-dot ${player.ready ? 'ready' : ''}" title="${player.ready ? 'جاهز أو عليه الدور' : 'ينتظر'}"></span></div>`;
    }).join('');
  }

  function roomSocialHtml(isOwner) {
    const invites = friends.length
      ? `<div class="invite-row"><select id="friendSelect" class="select"><option value="">دعوة صديق...</option>${friends.filter(friend => !currentRoom.players.some(player => player.username === friend.username)).map(friend => `<option value="${escapeHtml(friend.username)}">${escapeHtml(friend.displayName || friend.username)}${friend.isOnline ? ' • متصل' : ''}</option>`).join('')}</select><button id="inviteBtn" class="secondary" type="button"><i class="fa-solid fa-user-plus"></i> دعوة</button></div>`
      : '<div class="muted" style="margin-top:13px">أضف أصدقاء أولًا حتى ترسل دعوة.</div>';
    const manage = currentRoom.players.filter(player => player.username !== me?.username).map(player => `<button class="secondary manage-player" type="button" data-target="${escapeHtml(player.username)}"><i class="fa-solid fa-ellipsis"></i> ${escapeHtml(player.displayName || player.username)}</button>`).join('');
    return `${invites}<div class="room-manage">${isOwner && manage ? `<span class="muted">إدارة اللاعبين:</span>${manage}` : ''}</div>`;
  }

  function bindRoomCommon(host) {
    $('leaveGameBtn')?.addEventListener('click', leaveGame);
    $('inviteBtn')?.addEventListener('click', () => {
      const target = $('friendSelect')?.value;
      if (!target) return toast('اختَر صديقًا أولًا', true);
      socket.emit('game:invite', { roomId: currentRoom.roomId, targetUser: target });
    });
    host.querySelectorAll('.manage-player').forEach(button => button.addEventListener('click', () => managePlayer(button.dataset.target)));
    $('startGameBtn')?.addEventListener('click', () => socket.emit('game:start', { roomId: currentRoom.roomId }));
  }

  function startCountdown(elementId, deadlineAt) {
    clearInterval(countdownTimer);
    const update = () => {
      const node = $(elementId);
      if (!node) return clearInterval(countdownTimer);
      const left = Math.max(0, Number(deadlineAt || 0) - Date.now());
      node.textContent = left ? `${Math.ceil(left / 1000)} ث` : 'انتهى الوقت';
      if (!left) clearInterval(countdownTimer);
    };
    update();
    if (Number(deadlineAt || 0) > Date.now()) countdownTimer = setInterval(update, 250);
  }

  function quizResultHtml(result) {
    if (!result) return '<div class="game-result muted">لم تنتهِ جولة أسئلة بعد.</div>';
    const winners = (result.roundWinners || []).map(playerName).join('، ') || 'لا توجد إجابة صحيحة';
    const rows = (result.entries || []).map(entry => `<div class="quiz-result-row"><span>${escapeHtml(playerName(entry.username))}</span><strong class="${entry.correct ? 'correct' : 'wrong'}">${entry.correct ? `+${Number(entry.points || 0)}` : (entry.answered ? 'إجابة خاطئة' : 'لم يجب')}</strong></div>`).join('');
    return `<div class="game-result quiz-result"><strong>الإجابة الصحيحة: ${escapeHtml(result.correctText || '')}</strong><span>الفائزون بالجولة: ${escapeHtml(winners)}</span>${rows}</div>`;
  }

  function renderQuizRoom(host, isOwner) {
    const quiz = currentRoom.quiz || {};
    const question = quiz.question;
    const answered = Array.isArray(quiz.answeredPlayers) && quiz.answeredPlayers.includes(me?.username);
    const canStart = isOwner && currentRoom.players.length >= 2 && ['waiting', 'ready'].includes(currentRoom.status);
    const scores = Object.entries(quiz.scores || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    const scoreHtml = scores.map(([username, score], index) => `<span class="quiz-score"><b>${index + 1}</b> ${escapeHtml(playerName(username))}: <strong>${Number(score || 0)}</strong></span>`).join('');
    const options = currentRoom.status === 'playing' && question
      ? question.options.map((option, index) => `<button class="quiz-option" type="button" data-quiz-answer="${index}" ${answered ? 'disabled' : ''}><span>${['أ', 'ب', 'ج', 'د'][index] || index + 1}</span>${escapeHtml(option)}</button>`).join('')
      : '<div class="muted">اضغط «بدء اللعبة» حتى يظهر السؤال للجميع.</div>';
    const status = currentRoom.status === 'playing'
      ? 'الجولة جارية'
      : currentRoom.status === 'results' ? 'عرض النتيجة' : currentRoom.status === 'finished' ? 'انتهت اللعبة' : 'بانتظار بدء اللعبة';
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • الجولة ${Number(currentRoom.round || 1)} • ${status}</p><div class="players-grid" style="margin-top:15px">${playerCardsHtml() || '<div class="empty-box">لاعبون</div>'}</div><div class="quiz-scoreboard">${scoreHtml || '<span class="muted">النقاط تظهر عند بدء الجولة.</span>'}</div><div class="quiz-panel"><div class="quiz-panel-head"><span class="quiz-category">${escapeHtml(quiz.category || question?.category || 'أسئلة متنوعة')}</span><strong id="quizCountdown">${currentRoom.status === 'playing' ? '...' : ''}</strong></div><h3>${escapeHtml(question?.question || 'جاهز لتحدي المعلومات؟')}</h3><div class="quiz-options">${options}</div>${answered ? '<p class="muted quiz-wait">تم تسجيل إجابتك. انتظر بقية اللاعبين.</p>' : ''}</div>${canStart ? '<button id="startGameBtn" class="primary start-game-btn" type="button"><i class="fa-solid fa-play"></i> بدء اللعبة</button>' : currentRoom.status === 'ready' ? '<p class="muted start-hint">بانتظار مالك الغرفة حتى يبدأ اللعبة.</p>' : ''}${quizResultHtml(quiz.lastResult)}${roomSocialHtml(isOwner)}`;
    bindRoomCommon(host);
    host.querySelectorAll('[data-quiz-answer]').forEach(button => button.addEventListener('click', () => sendAction('answer', button.dataset.quizAnswer)));
    if (currentRoom.status === 'playing') startCountdown('quizCountdown', quiz.deadlineAt);
  }

  function snakesBoardHtml() {
    const positions = currentRoom.snakes?.positions || {};
    const colors = ['red', 'blue', 'green', 'gold'];
    const cells = [];
    for (let row = 9; row >= 0; row -= 1) {
      const numbers = Array.from({ length: 10 }, (_, index) => row * 10 + index + 1);
      if ((9 - row) % 2 === 1) numbers.reverse();
      cells.push(...numbers);
    }
    return cells.map(number => {
      const jump = currentRoom.snakes?.ladders?.[number] ?? currentRoom.snakes?.ladders?.[String(number)];
      const type = jump ? (jump > number ? 'ladder' : 'snake') : '';
      const tokens = currentRoom.players.map((player, index) => {
        const username = player.username;
        const name = playerName(username) || username || '?';
        return Number(positions[username]) === number
          ? `<span class="board-token ${colors[index % colors.length]}" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 1))}</span>`
          : '';
      }).join('');
      const jumpBadge = jump
        ? `<em class="jump-badge ${type}" title="${jump > number ? 'سلم إلى' : 'أفعى إلى'} ${jump}">${jump > number ? '🪜' : '🐍'} ${jump}</em>`
        : '';
      return `<div class="snakes-cell ${type} ${jump ? 'has-jump' : ''}" data-cell="${number}" data-jump="${jump || ''}"><small>${number}</small>${tokens}${jumpBadge}</div>`;
    }).join('');
  }

  function dominoHalfHtml(value) {
    const pip = Number(value);
    return `<span class="domino-half ${pip === 0 ? 'blank' : ''}">${pip === 0 ? '·' : pip}</span>`;
  }

  function dominoTileHtml(tile, { board = false, selected = false, disabled = false, legal = false } = {}) {
    if (!tile) return '';
    const className = ['domino-tile', board ? 'board' : 'hand', selected ? 'selected' : '', legal ? 'legal' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ');
    const tag = board ? 'div' : 'button';
    const type = board ? '' : ' type="button"';
    const attrs = board ? '' : ` data-domino-tile="${escapeHtml(tile.id)}"${disabled ? ' disabled' : ''}`;
    return `<${tag} class="${className}"${type}${attrs} aria-label="حجر ${tile.a} و ${tile.b}">${dominoHalfHtml(tile.a)}${dominoHalfHtml(tile.b)}</${tag}>`;
  }

  function dominoResultHtml(result) {
    if (!result) return '<div class="game-result muted">بعد بدء المباراة ستظهر النتيجة هنا.</div>';
    const names = (result.winners || (result.winner ? [result.winner] : [])).map(playerName).join('، ') || 'لا يوجد فائز منفرد';
    const scoreHtml = Object.entries(result.scores || {}).map(([username, score]) => `<span>${escapeHtml(playerName(username))}: <strong>${Number(score || 0)}</strong></span>`).join(' • ');
    return `<div class="game-result domino-result"><strong>${result.type === 'blocked' ? 'انغلقت الجولة' : 'انتهت الجولة'}</strong><span>${result.type === 'blocked' ? `الأقل نقاطاً: ${escapeHtml(names)}` : `الفائز: ${escapeHtml(names)}`}${Number(result.award || 0) ? ` • كسب ${Number(result.award)} نقطة` : ''}</span><small>${scoreHtml}</small></div>`;
  }

  function dominoLastMoveText(move) {
    if (!move) return 'ابدأ الجولة حتى تظهر حركة الأحجار.';
    const player = escapeHtml(playerName(move.player));
    if (move.type === 'start') return `بدأت الجولة بحجر ${Number(move.tile?.a)} | ${Number(move.tile?.b)}.`;
    if (move.type === 'play') return `${player} وضع ${Number(move.tile?.a)} | ${Number(move.tile?.b)} على جهة ${move.side === 'left' ? 'اليسار' : 'اليمين'}${move.automatic ? ' تلقائياً' : ''}.`;
    if (move.type === 'draw') return `${player} سحب حجراً من المخزون${move.automatic ? ' تلقائياً' : ''}.`;
    if (move.type === 'pass') return `${player} مرّر الدور${move.automatic ? ' تلقائياً' : ''}.`;
    return 'تم تحديث الجولة.';
  }

  function renderDominoRoom(host, isOwner) {
    const domino = currentRoom.domino || {};
    const hand = Array.isArray(dominoPrivate?.hand) ? dominoPrivate.hand : [];
    const legalIds = new Set(dominoPrivate?.legalTileIds || []);
    const isTurn = Boolean(dominoPrivate?.isTurn && domino.currentPlayer === me?.username);
    const selectedTile = hand.find(tile => tile.id === dominoSelectedTileId) || null;
    if (!selectedTile || !legalIds.has(selectedTile.id)) dominoSelectedTileId = '';
    const activeTile = hand.find(tile => tile.id === dominoSelectedTileId) || null;
    const activeMoves = (dominoPrivate?.legalMoves || []).filter(move => move.tileId === activeTile?.id).map(move => move.side);
    const canStart = isOwner && [2, 4].includes(currentRoom.players.length) && ['waiting', 'ready', 'finished'].includes(currentRoom.status);
    const status = currentRoom.status === 'finished'
      ? `الفائز: ${escapeHtml(playerName(domino.winner))}`
      : currentRoom.status === 'playing'
        ? `الدور على: ${escapeHtml(playerName(domino.currentPlayer))}`
        : 'بانتظار بدء المباراة';
    const handHtml = hand.length
      ? hand.map(tile => dominoTileHtml(tile, { selected: tile.id === dominoSelectedTileId, legal: isTurn && legalIds.has(tile.id), disabled: !isTurn || !legalIds.has(tile.id) })).join('')
      : '<div class="muted">ستظهر أحجارك هنا بعد بدء المباراة.</div>';
    const boardHtml = (domino.board || []).length
      ? domino.board.map(tile => dominoTileHtml(tile, { board: true })).join('')
      : '<span class="muted">لا توجد أحجار على الطاولة.</span>';
    const placementHtml = activeTile && activeMoves.length
      ? `<div class="domino-placement"><span>اختر جهة وضع الحجر:</span>${activeMoves.includes('left') ? '<button class="secondary" data-domino-side="left" type="button">يسار</button>' : ''}${activeMoves.includes('right') ? '<button class="secondary" data-domino-side="right" type="button">يمين</button>' : ''}</div>`
      : isTurn && dominoPrivate?.canDraw
        ? '<div class="domino-hint">لا يوجد حجر صالح؛ اسحب حجراً من المخزون.</div>'
        : isTurn && dominoPrivate?.canPass
          ? '<div class="domino-hint">لا توجد أحجار صالحة والمخزون فارغ؛ مرّر الدور.</div>'
          : isTurn
            ? '<div class="domino-hint">اختَر حجراً مضيئاً من يدك.</div>'
            : '<div class="domino-hint">انتظر دورك حتى تضع حجراً.</div>';
    const startHint = currentRoom.status === 'ready' && ![2, 4].includes(currentRoom.players.length)
      ? '<p class="muted start-hint">الدومنة تبدأ عند اكتمال لاعبين أو أربعة لاعبين.</p>'
      : '';
    const controls = isTurn
      ? `${dominoPrivate?.canDraw ? '<button class="game-action" data-domino-action="draw" type="button"><i class="fa-solid fa-box-open"></i> اسحب حجراً</button>' : ''}${dominoPrivate?.canPass ? '<button class="secondary" data-domino-action="pass" type="button"><i class="fa-solid fa-forward"></i> مرّر الدور</button>' : ''}`
      : '';
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • ${status}</p><div class="players-grid" style="margin-top:15px">${playerCardsHtml() || '<div class="empty-box">لاعبون</div>'}</div><div class="domino-meta"><span><i class="fa-solid fa-box-open"></i> المخزون: <strong>${Number(domino.boneyardCount || 0)}</strong></span><span id="dominoCountdown">${currentRoom.status === 'playing' ? '...' : ''}</span></div><div class="domino-board-wrap"><div class="domino-board-chain">${boardHtml}</div></div><div class="domino-ends"><span>النهاية اليسرى: <b>${domino.leftEnd == null ? '—' : Number(domino.leftEnd)}</b></span><span>النهاية اليمنى: <b>${domino.rightEnd == null ? '—' : Number(domino.rightEnd)}</b></span></div><div class="domino-last-move">${dominoLastMoveText(domino.lastMove)}</div><div class="domino-hand-panel"><div class="domino-hand-head"><strong>أحجارك</strong><small>${hand.length} حجر</small></div><div class="domino-hand">${handHtml}</div>${placementHtml}<div class="domino-controls">${controls}</div></div>${canStart ? `<button id="startGameBtn" class="primary start-game-btn" type="button"><i class="fa-solid fa-play"></i> ${currentRoom.status === 'finished' ? 'إعادة المباراة' : 'بدء اللعبة'}</button>` : currentRoom.status === 'ready' && [2, 4].includes(currentRoom.players.length) ? '<p class="muted start-hint">بانتظار مالك الغرفة حتى يبدأ المباراة.</p>' : ''}${startHint}${dominoResultHtml(currentRoom.lastResult)}${roomSocialHtml(isOwner)}`;
    bindRoomCommon(host);
    host.querySelectorAll('[data-domino-tile]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      dominoSelectedTileId = dominoSelectedTileId === button.dataset.dominoTile ? '' : button.dataset.dominoTile;
      renderCurrentRoom();
    }));
    host.querySelectorAll('[data-domino-side]').forEach(button => button.addEventListener('click', () => {
      if (!dominoSelectedTileId) return;
      socket.emit('game:action', { roomId: currentRoom.roomId, action: 'play', tileId: dominoSelectedTileId, side: button.dataset.dominoSide });
      dominoSelectedTileId = '';
    }));
    host.querySelectorAll('[data-domino-action]').forEach(button => button.addEventListener('click', () => {
      socket.emit('game:action', { roomId: currentRoom.roomId, action: button.dataset.dominoAction });
      dominoSelectedTileId = '';
    }));
    if (currentRoom.status === 'playing') startCountdown('dominoCountdown', domino.turnDeadlineAt);
  }

  const unoColorNames = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر', blue: 'أزرق' };
  const unoColorHex = { red: '#ef476f', yellow: '#f8c537', green: '#18b77a', blue: '#3f8cff' };

  function unoCardSymbol(card) {
    if (card.kind === 'number') return String(card.value);
    return ({ skip: '⛔', reverse: '↔', draw2: '+2', wild: '🌈', wild_draw4: '+4' }[card.kind] || 'UNO');
  }

  function unoCardText(card) {
    if (card.kind === 'number') return `رقم ${card.value}`;
    return ({ skip: 'تخطي', reverse: 'عكس الاتجاه', draw2: 'اسحب 2', wild: 'تغيير اللون', wild_draw4: 'اسحب 4' }[card.kind] || 'بطاقة خاصة');
  }

  function unoCardHtml(card, { selected = false, legal = false, disabled = false, board = false } = {}) {
    const className = ['uno-card', card.color || 'wild', board ? 'board' : 'hand', selected ? 'selected' : '', legal ? 'legal' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ');
    if (board) return `<div class="${className}" title="${escapeHtml(unoCardText(card))}"><span>${unoCardSymbol(card)}</span><small>${escapeHtml(unoCardText(card))}</small></div>`;
    return `<button class="${className}" type="button" data-uno-card="${escapeHtml(card.id)}"${disabled ? ' disabled' : ''} aria-label="${escapeHtml(unoCardText(card))}"><span>${unoCardSymbol(card)}</span><small>${escapeHtml(unoCardText(card))}</small></button>`;
  }

  function unoResultHtml(result) {
    if (!result) return '<div class="game-result muted">بعد بدء الجولة ستظهر النتيجة هنا.</div>';
    const winner = escapeHtml(playerName(result.winner));
    const scoreHtml = Object.entries(result.scores || {}).map(([username, score]) => `<span>${escapeHtml(playerName(username))}: <strong>${Number(score || 0)}</strong></span>`).join(' • ');
    return `<div class="game-result uno-result"><strong>الفائز: ${winner}</strong><span>مكافأة الجولة: ${Number(result.award || 0)} نقطة</span><small>${scoreHtml}</small></div>`;
  }

  function unoLastMoveText(move) {
    if (!move) return 'ابدأ الجولة حتى تظهر الحركات.';
    const player = escapeHtml(playerName(move.player));
    if (move.type === 'start') return 'بدأت الجولة ببطاقة رقمية.';
    if (move.type === 'play') return `${player} لعب ${escapeHtml(unoCardText(move.card || {}))}${move.chosenColor ? ` — اللون: ${escapeHtml(unoColorNames[move.chosenColor] || move.chosenColor)}` : ''}${move.automatic ? ' تلقائياً' : ''}.`;
    if (move.type === 'draw') return `${player} سحب بطاقة${move.automatic ? ' تلقائياً' : ''}.`;
    if (move.type === 'penalty') return `${player} سحب ${Number(move.amount || 0)} بطاقات عقوبة.`;
    if (move.type === 'uno') return `${player} قال UNO!`;
    if (move.type === 'pass') return `${player} مرّر الدور.`;
    return 'تم تحديث الجولة.';
  }

  function renderUnoRoom(host, isOwner) {
    const uno = currentRoom.uno || {};
    const hand = Array.isArray(unoPrivate?.hand) ? unoPrivate.hand : [];
    const legalIds = new Set(unoPrivate?.legalCardIds || []);
    const isTurn = Boolean(unoPrivate?.isTurn && uno.currentPlayer === me?.username);
    const selectedCard = hand.find(card => card.id === unoSelectedCardId) || null;
    if (!selectedCard || !legalIds.has(selectedCard.id)) unoSelectedCardId = '';
    const activeCard = hand.find(card => card.id === unoSelectedCardId) || null;
    const canStart = isOwner && currentRoom.players.length >= 2 && currentRoom.players.length <= 8 && ['waiting', 'ready', 'finished'].includes(currentRoom.status);
    const status = currentRoom.status === 'finished'
      ? `الفائز: ${escapeHtml(playerName(uno.winner))}`
      : currentRoom.status === 'playing'
        ? `الدور على: ${escapeHtml(playerName(uno.currentPlayer))}`
        : 'بانتظار بدء الجولة';
    const color = uno.currentColor || 'blue';
    const topCardHtml = uno.topCard ? unoCardHtml(uno.topCard, { board: true }) : '<div class="muted">—</div>';
    const handHtml = hand.length
      ? hand.map(card => unoCardHtml(card, { selected: card.id === unoSelectedCardId, legal: isTurn && legalIds.has(card.id), disabled: !isTurn || !legalIds.has(card.id) })).join('')
      : '<div class="muted">ستظهر بطاقاتك هنا بعد بدء الجولة.</div>';
    const colorButtons = activeCard && ['wild', 'wild_draw4'].includes(activeCard.kind)
      ? `<div class="uno-color-picker"><span>اختَر اللون:</span>${Object.entries(unoColorNames).map(([id, label]) => `<button type="button" class="uno-color-choice" data-uno-color="${id}" style="--uno-choice:${unoColorHex[id]}">${label}</button>`).join('')}</div>`
      : activeCard
        ? '<div class="uno-placement"><span>البطاقة صالحة.</span><button class="primary" data-uno-action="play" type="button">العب البطاقة</button></div>'
        : isTurn && unoPrivate?.pendingDraw
          ? `<div class="uno-hint">عليك سحب ${Number(unoPrivate.pendingDraw)} بطاقات قبل متابعة اللعب.</div>`
          : isTurn && !(unoPrivate?.legalCardIds || []).length
            ? '<div class="uno-hint">لا توجد بطاقة صالحة؛ اسحب بطاقة.</div>'
            : isTurn
              ? '<div class="uno-hint">اختَر بطاقة مضيئة من يدك.</div>'
              : '<div class="uno-hint">انتظر دورك حتى تلعب.</div>';
    const drawLabel = unoPrivate?.pendingDraw ? `اسحب ${Number(unoPrivate.pendingDraw)} بطاقات` : 'اسحب بطاقة';
    const controls = `${isTurn && unoPrivate?.canDraw ? `<button class="game-action" data-uno-action="draw" type="button"><i class="fa-solid fa-layer-group"></i> ${drawLabel}</button>` : ''}${unoPrivate?.canCallUno ? '<button class="secondary" data-uno-action="uno" type="button"><i class="fa-solid fa-bullhorn"></i> UNO!</button>' : ''}`;
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • ${status}</p><div class="players-grid" style="margin-top:15px">${playerCardsHtml() || '<div class="empty-box">لاعبون</div>'}</div><div class="uno-meta"><span><i class="fa-solid fa-layer-group"></i> السحب: <strong>${Number(uno.deckCount || 0)}</strong></span><span>المهملات: <strong>${Number(uno.discardCount || 0)}</strong></span><span>الاتجاه: <strong>${uno.direction === 'counterclockwise' ? 'عكسي' : 'اعتيادي'}</strong></span><span id="unoCountdown">${currentRoom.status === 'playing' ? '...' : ''}</span></div><div class="uno-table"><div class="uno-current-color"><span>اللون الحالي</span><strong style="--uno-color:${unoColorHex[color] || unoColorHex.blue}">${escapeHtml(unoColorNames[color] || color)}</strong></div><div class="uno-discard"><div class="uno-pile-label">آخر بطاقة</div>${topCardHtml}</div><div class="uno-table-center"><b>UNO</b><small>${Number(uno.pendingDraw || 0) ? `العقوبة: +${Number(uno.pendingDraw)}` : 'طابق اللون أو الرقم أو الرمز'}</small></div></div><div class="uno-last-move">${unoLastMoveText(uno.lastMove)}</div><div class="uno-hand-panel"><div class="uno-hand-head"><strong>بطاقاتك</strong><small>${hand.length} بطاقة</small></div><div class="uno-hand">${handHtml}</div>${colorButtons}<div class="uno-controls">${controls}</div></div>${canStart ? `<button id="startGameBtn" class="primary start-game-btn" type="button"><i class="fa-solid fa-play"></i> ${currentRoom.status === 'finished' ? 'إعادة الجولة' : 'بدء الجولة'}</button>` : currentRoom.status === 'ready' ? '<p class="muted start-hint">بانتظار مالك الغرفة حتى يبدأ الجولة.</p>' : ''}${unoResultHtml(currentRoom.lastResult)}${roomSocialHtml(isOwner)}`;
    bindRoomCommon(host);
    host.querySelectorAll('[data-uno-card]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      unoSelectedCardId = unoSelectedCardId === button.dataset.unoCard ? '' : button.dataset.unoCard;
      renderCurrentRoom();
    }));
    host.querySelectorAll('[data-uno-color]').forEach(button => button.addEventListener('click', () => {
      if (!unoSelectedCardId) return;
      socket.emit('game:action', { roomId: currentRoom.roomId, action: 'play', cardId: unoSelectedCardId, chosenColor: button.dataset.unoColor });
      unoSelectedCardId = '';
    }));
    host.querySelectorAll('[data-uno-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.unoAction;
      if (action === 'play' && !unoSelectedCardId) return toast('اختَر بطاقة أولاً', true);
      socket.emit('game:action', { roomId: currentRoom.roomId, action, cardId: unoSelectedCardId });
      unoSelectedCardId = '';
    }));
    if (currentRoom.status === 'playing') startCountdown('unoCountdown', uno.turnDeadlineAt);
  }

  const jackarooSuitNames = { hearts: 'قلوب', diamonds: 'ماس', clubs: 'نوادي', spades: 'بستوني' };
  const jackarooSuitSymbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

  function jackarooCardText(card) {
    if (!card) return 'بطاقة';
    return `${card.rank || ''} ${jackarooSuitNames[card.suit] || card.suit || ''}`.trim();
  }

  function jackarooCardHtml(card, { selected = false, legal = false, disabled = false, board = false } = {}) {
    if (!card) return '';
    const red = ['hearts', 'diamonds'].includes(card.suit);
    const className = ['jackaroo-card', red ? 'red' : 'black', board ? 'board' : '', selected ? 'selected' : '', legal ? 'legal' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ');
    const symbol = escapeHtml(card.symbol || jackarooSuitSymbols[card.suit] || '');
    const rank = escapeHtml(card.rank);
    const suit = escapeHtml(jackarooSuitNames[card.suit] || '');
    const inside = `<span class="jackaroo-card-corner top"><b>${rank}</b><i>${symbol}</i></span><span class="jackaroo-card-center"><b>${symbol}</b><small>JACKAROO</small></span><span class="jackaroo-card-corner bottom"><b>${rank}</b><i>${symbol}</i></span>`;
    if (board) return `<div class="${className}" aria-label="${escapeHtml(jackarooCardText(card))}" data-suit="${escapeHtml(card.suit || '')}" data-suit-label="${suit}">${inside}</div>`;
    return `<button class="${className}" type="button" data-jackaroo-card="${escapeHtml(card.id)}"${disabled ? ' disabled' : ''} aria-label="${escapeHtml(jackarooCardText(card))}" data-suit="${escapeHtml(card.suit || '')}" data-suit-label="${suit}">${inside}</button>`;
  }

  function jackarooResultHtml(result, jackaroo) {
    if (!result) return '<div class="game-result muted">بعد بدء المباراة ستظهر نتيجة الفريقين هنا.</div>';
    const winners = (result.winners || []).map(playerName).join('، ') || 'الفريق الفائز';
    const isTwoPlayerMode = jackaroo?.teams?.team1?.length === 1 && jackaroo?.teams?.team2?.length === 1;
    const winnerLabel = isTwoPlayerMode ? `الفائز: ${winners}` : `فاز ${result.winnerTeam === 'team1' ? 'الفريق 1' : 'الفريق 2'}`;
    const scores = Object.entries(result.scores || jackaroo?.scores || {}).map(([team, score]) => `<span>${team === 'team1' ? 'الفريق 1' : 'الفريق 2'}: <strong>${Number(score || 0)}</strong></span>`).join(' • ');
    return `<div class="game-result jackaroo-result"><strong>${escapeHtml(winnerLabel)}</strong><span>${escapeHtml(winners)}</span><small>${scores}</small></div>`;
  }

  function jackarooLastMoveText(move) {
    if (!move) return 'ابدأ المباراة حتى تظهر حركات الكرات.';
    const player = escapeHtml(playerName(move.player));
    if (move.type === 'start') return 'بدأت المباراة. كل فريق يحاول إدخال كراته الأربع إلى البيت.';
    if (move.type === 'pass') return `${player} رمى بطاقة ${escapeHtml(jackarooCardText(move.card))} لعدم وجود حركة صالحة${move.automatic ? ' تلقائياً' : ''}.`;
    if (move.type === 'play') {
      const action = move.mode === 'start' ? 'أخرج كرة إلى البداية' : move.mode === 'home' ? 'أدخل كرة إلى البيت' : `حرّك الكرة ${Number(move.to) - Number(move.from) >= 0 ? `${Number(move.to) - Number(move.from)} خطوات` : 'للخلف'}`;
      const captured = move.captured?.length ? ` وأعاد ${move.captured.length} من كرات الخصم` : '';
      return `${player} لعب ${escapeHtml(jackarooCardText(move.card))}: ${action}${captured}${move.automatic ? ' تلقائياً' : ''}.`;
    }
    return 'تم تحديث المباراة.';
  }

  function jackarooBoardHtml(jackaroo) {
    const playerCount = Array.isArray(currentRoom?.players) && currentRoom.players.length === 2 ? 2 : 4;
    const players = currentRoom?.players || [];
    const publicTokens = Array.isArray(jackaroo?.tokens) ? jackaroo.tokens : [];
    const tokenOwnerIndex = token => Number.isInteger(Number(token?.playerIndex))
      ? Number(token.playerIndex)
      : players.findIndex(player => player?.username === token?.username);
    const tokenHtml = (token, extraClass = '') => {
      const index = Math.max(0, tokenOwnerIndex(token));
      const owner = playerName(token?.username);
      const initial = escapeHtml(String(owner || '?').trim().slice(0, 1) || '?');
      return `<span class="jackaroo-token jackaroo-color-${index % 4} ${token?.team || ''} ${extraClass}" title="${escapeHtml(owner)} — ${escapeHtml(token?.marbleId || '')}">${initial}</span>`;
    };
    const trackTokens = cell => {
      const tokens = jackaroo?.cellTokens?.[cell] || jackaroo?.cellTokens?.[String(cell)] || [];
      return tokens.map(token => tokenHtml(token, 'on-track')).join('');
    };

    // Two-player Jackaroo follows the supplied physical board: one circular
    // 52-space track, opposite north/south home lanes, four visible marbles
    // per player, and a clear card pile in the centre. The authoritative cell
    // numbers are unchanged; only their presentation is circular here.
    const circularCells = Array.from({ length: Number(jackaroo?.boardSize || 52) }, (_, cell) => {
      const angle = (-90 + (cell * 360 / Number(jackaroo?.boardSize || 52))) * Math.PI / 180;
      const x = 50 + Math.cos(angle) * 41;
      const y = 50 + Math.sin(angle) * 41;
      return `<div class="jackaroo-cell jackaroo-circle-cell lane-${Math.floor(cell / 13) + 1}" data-cell="${cell}" style="left:${x.toFixed(3)}%;top:${y.toFixed(3)}%"><small>${cell + 1}</small><div>${trackTokens(cell)}</div></div>`;
    });

    // Fourteen-by-fourteen perimeter for the four-player board.  It retains
    // the same 52 cells and lets every player see every opponent marble.
    const coordinates = [];
    for (let column = 1; column <= 14; column += 1) coordinates.push([1, column]);
    for (let row = 2; row <= 14; row += 1) coordinates.push([row, 14]);
    for (let column = 13; column >= 1; column -= 1) coordinates.push([14, column]);
    for (let row = 13; row >= 2; row -= 1) coordinates.push([row, 1]);
    const perimeterCells = Array.from({ length: Number(jackaroo?.boardSize || 52) }, (_, cell) => {
      const [row, column] = coordinates[cell] || [1, 1];
      return `<div class="jackaroo-cell lane-${Math.floor(cell / 13) + 1}" data-cell="${cell}" style="grid-row:${row};grid-column:${column}"><small>${cell + 1}</small><div>${trackTokens(cell)}</div></div>`;
    });

    const lane = (direction, team, label, playerIndex) => {
      const player = players[playerIndex] || null;
      const username = typeof player === 'object' ? player?.username : player;
      const playerTokens = publicTokens.filter(token => token.username === username);
      const baseTokens = playerTokens.filter(token => token.status === 'base');
      const homeTokens = playerTokens.filter(token => token.status === 'home');
      const holes = (tokens, type) => Array.from({ length: 4 }, (_, index) => {
        const token = tokens[index];
        return `<span class="jackaroo-lane-hole ${type} ${token ? 'filled' : ''}">${token ? tokenHtml(token, 'lane-marble') : ''}</span>`;
      }).join('');
      return `<div class="jackaroo-lane lane-${direction} ${team} player-color-${playerIndex}" aria-label="${escapeHtml(label)}"><div class="jackaroo-lane-head"><strong>${escapeHtml(playerName(player) || label)}</strong><small>${escapeHtml(label)}</small></div><div class="jackaroo-lane-section"><small>القاعدة</small><div class="jackaroo-lane-holes base-holes">${holes(baseTokens, 'base-hole')}</div></div><div class="jackaroo-lane-section home-section"><small>البيت</small><div class="jackaroo-lane-holes home-holes">${holes(homeTokens, 'home-hole')}</div></div></div>`;
    };
    const lanes = playerCount === 2
      ? `${lane('north', 'team1', 'اللاعب 1', 0)}${lane('south', 'team2', 'اللاعب 2', 1)}`
      : `${lane('north', 'team1', 'الفريق 1', 0)}${lane('east', 'team2', 'الفريق 2', 1)}${lane('south', 'team1', 'الفريق 1', 2)}${lane('west', 'team2', 'الفريق 2', 3)}`;
    return `${playerCount === 2 ? circularCells.join('') : perimeterCells.join('')}${lanes}`;
  }

  function jackarooBaseHomeHtml(jackaroo) {
    const players = currentRoom.players || [];
    const isTwoPlayerMode = players.length === 2;
    return players.map((player, index) => {
      const tokens = (jackaroo?.tokens || []).filter(token => token.username === player.username);
      const base = tokens.filter(token => token.status === 'base').length;
      const home = tokens.filter(token => token.status === 'home').length;
      const team = isTwoPlayerMode ? (index === 0 ? 'team1' : 'team2') : (index % 2 === 0 ? 'team1' : 'team2');
      const label = isTwoPlayerMode ? `اللاعب ${index + 1}` : (team === 'team1' ? 'الفريق 1' : 'الفريق 2');
      return `<div class="jackaroo-player-zone ${team}"><strong>${escapeHtml(playerName(player.username))}</strong><span>${label}</span><small>البيت ${home}/4 • القاعدة ${base}</small></div>`;
    }).join('');
  }

  function renderJackarooRoom(host, isOwner) {
    const jackaroo = currentRoom.jackaroo || {};
    const isTwoPlayerMode = currentRoom.players.length === 2;
    const jackarooPlayerCountReady = [2, 4].includes(currentRoom.players.length);
    const hand = Array.isArray(jackarooPrivate?.hand) ? jackarooPrivate.hand : [];
    const legalIds = new Set(jackarooPrivate?.legalCardIds || []);
    const isTurn = Boolean(jackarooPrivate?.isTurn && jackaroo.currentPlayer === me?.username);
    const selectedCard = hand.find(card => card.id === jackarooSelectedCardId) || null;
    if (!selectedCard || !legalIds.has(selectedCard.id)) jackarooSelectedCardId = '';
    const activeCard = hand.find(card => card.id === jackarooSelectedCardId) || null;
    const activeMoves = (jackarooPrivate?.legalMoves || []).filter(move => move.cardId === activeCard?.id);
    const canStart = isOwner && jackarooPlayerCountReady && ['waiting', 'ready', 'finished'].includes(currentRoom.status);
    const status = currentRoom.status === 'finished'
      ? `فاز ${jackaroo.winnerTeam === 'team1' ? 'الفريق 1' : 'الفريق 2'}`
      : currentRoom.status === 'playing'
        ? `الدور على: ${escapeHtml(playerName(jackaroo.currentPlayer))}`
        : jackarooPlayerCountReady ? (isTwoPlayerMode ? 'وضع لاعبين جاهز للبدء' : 'جاهزة للبدء') : 'بانتظار لاعبين أو أربعة لاعبين';
    const handHtml = hand.length
      ? hand.map(card => jackarooCardHtml(card, { selected: card.id === jackarooSelectedCardId, legal: isTurn && legalIds.has(card.id), disabled: !isTurn || !legalIds.has(card.id) })).join('')
      : '<div class="muted">ستظهر بطاقاتك بعد اكتمال اللاعبين وبدء المباراة.</div>';
    const moveButtons = activeCard && activeMoves.length
      ? `<div class="jackaroo-moves"><span>اختر الكرة التي تريد تحريكها:</span>${activeMoves.map(move => `<button class="secondary" type="button" data-jackaroo-marble="${escapeHtml(move.marbleId)}">${move.mode === 'start' ? 'إخراج' : move.mode === 'home' ? 'إلى البيت' : `${move.steps > 0 ? '+' : ''}${move.steps} خطوات`} — ${escapeHtml(move.marbleId)}</button>`).join('')}</div>`
      : isTurn && jackarooPrivate?.canPass
        ? '<div class="jackaroo-hint">لا توجد حركة صالحة؛ يمكنك رمي بطاقة وتمرير الدور.</div>'
        : isTurn
          ? '<div class="jackaroo-hint">اضغط بطاقة مضيئة ثم اختر إحدى كراتك.</div>'
          : '<div class="jackaroo-hint">انتظر دورك. البطاقات مخفية عن باقي اللاعبين.</div>';
    const controls = isTurn && jackarooPrivate?.canPass ? '<button class="secondary" data-jackaroo-action="pass" type="button"><i class="fa-solid fa-forward"></i> مرّر وارمِ بطاقة</button>' : '';
    const teamScores = isTwoPlayerMode
      ? `<div class="jackaroo-score"><span>${escapeHtml(playerName(jackaroo.teams?.team1?.[0]) || 'اللاعب 1')} <strong>${Number(jackaroo.scores?.team1 || 0)}</strong></span><span>${escapeHtml(playerName(jackaroo.teams?.team2?.[0]) || 'اللاعب 2')} <strong>${Number(jackaroo.scores?.team2 || 0)}</strong></span></div>`
      : `<div class="jackaroo-score"><span>الفريق 1 <strong>${Number(jackaroo.scores?.team1 || 0)}</strong></span><span>الفريق 2 <strong>${Number(jackaroo.scores?.team2 || 0)}</strong></span></div>`;
    const discardTopHtml = jackaroo.discardTop
      ? jackarooCardHtml(jackaroo.discardTop, { board: true })
      : '<span class="jackaroo-empty-card">—</span>';
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • ${status}</p><div class="players-grid" style="margin-top:15px">${playerCardsHtml() || '<div class="empty-box">لاعبون</div>'}</div><div class="jackaroo-mode-note"><i class="fa-solid fa-users"></i> ${isTwoPlayerMode ? 'وضع لاعبين: لوحان متقابلان، كل لاعب يملك 4 كرات' : 'وضع أربعة لاعبين: لوح كامل بأربع جهات وفريقين'}</div><div class="jackaroo-meta"><span><i class="fa-solid fa-layer-group"></i> السحب: <strong>${Number(jackaroo.deckCount || 0)}</strong></span><span>المهملات: <strong>${Number(jackaroo.discardCount || 0)}</strong></span><span id="jackarooCountdown">${currentRoom.status === 'playing' ? '...' : ''}</span></div>${teamScores}<div class="jackaroo-zones">${jackarooBaseHomeHtml()}</div><div class="jackaroo-board-wrap"><div class="jackaroo-table"><div class="jackaroo-board ${isTwoPlayerMode ? 'mode-2' : 'mode-4'}">${jackarooBoardHtml(jackaroo)}</div><div class="jackaroo-center"><span class="jackaroo-center-label">آخر بطاقة</span>${discardTopHtml}<small>${Number(jackaroo.discardCount || 0)} بطاقة بالمهملات</small></div></div></div><div class="jackaroo-last-move">${jackarooLastMoveText(jackaroo.lastMove)}</div><div class="jackaroo-hand-panel"><div class="jackaroo-hand-head"><strong>بطاقاتك</strong><small>${hand.length} بطاقات • ${jackarooPrivate?.team === 'team1' ? 'الفريق 1' : jackarooPrivate?.team === 'team2' ? 'الفريق 2' : ''}</small></div><div class="jackaroo-hand">${handHtml}</div>${moveButtons}<div class="jackaroo-controls">${controls}</div></div>${canStart ? `<button id="startGameBtn" class="primary start-game-btn" type="button"><i class="fa-solid fa-play"></i> ${currentRoom.status === 'finished' ? 'إعادة المباراة' : 'بدء المباراة'}</button>` : currentRoom.status === 'ready' && !jackarooPlayerCountReady ? '<p class="muted start-hint">توميرو تبدأ بلاعبين أو أربعة لاعبين.</p>' : currentRoom.status === 'ready' ? '<p class="muted start-hint">بانتظار مالك الغرفة حتى يبدأ المباراة.</p>' : ''}${jackarooResultHtml(currentRoom.lastResult, jackaroo)}${roomSocialHtml(isOwner)}`;
    bindRoomCommon(host);
    host.querySelectorAll('[data-jackaroo-card]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      jackarooSelectedCardId = jackarooSelectedCardId === button.dataset.jackarooCard ? '' : button.dataset.jackarooCard;
      renderCurrentRoom();
    }));
    host.querySelectorAll('[data-jackaroo-marble]').forEach(button => button.addEventListener('click', () => {
      if (!jackarooSelectedCardId) return;
      socket.emit('game:action', { roomId: currentRoom.roomId, action: 'play', cardId: jackarooSelectedCardId, marbleId: button.dataset.jackarooMarble });
      jackarooSelectedCardId = '';
    }));
    host.querySelectorAll('[data-jackaroo-action]').forEach(button => button.addEventListener('click', () => {
      socket.emit('game:action', { roomId: currentRoom.roomId, action: button.dataset.jackarooAction, cardId: jackarooPrivate?.hand?.[0]?.id || '' });
      jackarooSelectedCardId = '';
    }));
    if (currentRoom.status === 'playing') startCountdown('jackarooCountdown', jackaroo.turnDeadlineAt);
  }

  function renderSnakesRoom(host, isOwner) {
    const snakes = currentRoom.snakes || {};
    const currentPlayer = snakes.currentPlayer ? playerName(snakes.currentPlayer) : '';
    const myTurn = currentRoom.status === 'playing' && snakes.currentPlayer === me?.username;
    const canStart = isOwner && currentRoom.players.length >= 2 && ['waiting', 'ready', 'finished'].includes(currentRoom.status);
    const last = snakes.lastMove;
    const status = currentRoom.status === 'finished' ? `الفائز: ${escapeHtml(playerName(snakes.winner))}` : currentRoom.status === 'playing' ? `الدور على: ${escapeHtml(currentPlayer)}` : 'بانتظار بدء اللعبة';
    const moveText = last ? `${escapeHtml(playerName(last.player))} رمى ${Number(last.roll)} ووصل إلى الخانة ${Number(last.after)}${last.jumpTo ? (last.jumpTo > last.stepped ? ' وصعد السلم' : ' ونزل مع الأفعى') : ''}` : 'ابدأ الجولة لرؤية حركة اللاعبين.';
    const resultText = currentRoom.status === 'finished'
      ? `<strong>الفائز: ${escapeHtml(playerName(snakes.winner))}</strong> — يمكنك بدء مباراة جديدة من الزر أعلاه.`
      : 'الهدف: الوصول إلى الخانة 100. رمية 6 تمنحك دورًا إضافيًا.';
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • ${status}</p><div class="players-grid" style="margin-top:15px">${playerCardsHtml() || '<div class="empty-box">لاعبون</div>'}</div><div class="snakes-board-wrap"><div class="snakes-board">${snakesBoardHtml()}</div><div class="snakes-legend"><span><i class="legend-dot red"></i> لاعب 1</span><span><i class="legend-dot blue"></i> لاعب 2</span><span><i class="legend-dot green"></i> لاعب 3</span><span><i class="legend-dot gold"></i> لاعب 4</span></div></div><div class="snakes-controls"><div class="snakes-last-move">${moveText}</div>${myTurn ? '<button class="game-action" data-action="roll" type="button"><i class="fa-solid fa-dice"></i> ارمِ النرد</button>' : currentRoom.status === 'playing' ? '<span class="muted">انتظر دورك</span>' : ''}<strong id="snakesCountdown">${currentRoom.status === 'playing' ? '...' : ''}</strong></div>${canStart ? `<button id="startGameBtn" class="primary start-game-btn" type="button"><i class="fa-solid fa-play"></i> ${currentRoom.status === 'finished' ? 'إعادة المباراة' : 'بدء اللعبة'}</button>` : currentRoom.status === 'ready' ? '<p class="muted start-hint">بانتظار مالك الغرفة حتى يبدأ اللعبة.</p>' : ''}<div class="game-result">${resultText}</div>${roomSocialHtml(isOwner)}`;
    bindRoomCommon(host);
    host.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => sendAction(button.dataset.action)));
    if (currentRoom.status === 'playing') startCountdown('snakesCountdown', snakes.turnDeadlineAt);
  }

  function renderCurrentRoom() {
    const host = $('currentGame');
    if (!currentRoom) {
      host.innerHTML = '<div class="game-help"><i class="fa-solid fa-dice" style="font-size:44px;color:#bfa9ff"></i><h2>اختَر لعبة أو انضم إلى غرفة</h2><p>اللعب مجاني، والتحكم بالغرفة يكون عند منشئها. يمكنك طرد لاعب أو إرسال بلاغ عند الإساءة.</p></div>';
      return;
    }
    const isOwner = currentRoom.owner === me?.username;
    if (currentRoom.advanced === 'quiz') return renderQuizRoom(host, isOwner);
    if (currentRoom.advanced === 'snakes_ladders') return renderSnakesRoom(host, isOwner);
    if (currentRoom.advanced === 'dominoes') return renderDominoRoom(host, isOwner);
    if (currentRoom.advanced === 'uno') return renderUnoRoom(host, isOwner);
    if (currentRoom.advanced === 'jackaroo') return renderJackarooRoom(host, isOwner);
    const actions = currentRoom.action === 'roll'
      ? '<button class="game-action" data-action="roll" type="button"><i class="fa-solid fa-dice"></i> ارمِ النرد</button>'
      : currentRoom.action === 'choice'
        ? (currentRoom.choices || ['حجر','ورق','مقص']).map(choice => `<button class="game-action" data-choice="${escapeHtml(choice)}" type="button"><span class="choice-icon">${choiceIcon(choice)}</span>${escapeHtml(choice)}</button>`).join('')
        : `<div style="display:flex;gap:8px;width:min(420px,100%)"><input id="numberChoice" class="input" type="number" min="1" max="${Number(currentRoom.maxValue || 100)}" placeholder="رقم من 1 إلى ${Number(currentRoom.maxValue || 100)}"><button class="game-action" data-action="number" type="button">إرسال</button></div>`;
    const players = (currentRoom.players || []).map(player => `<div class="player-card">${profileAvatar(player)}<div class="player-copy"><strong>${escapeHtml(player.displayName || player.username)}${charismaBadge(player)}</strong><small>@${escapeHtml(player.username)}${player.isOnline ? ' • متصل' : ''}</small></div><span class="ready-dot ${player.ready ? 'ready' : ''}" title="${player.ready ? 'أرسل اختياره' : 'ينتظر'}"></span></div>`).join('');
    const invites = friends.length ? `<div class="invite-row"><select id="friendSelect" class="select"><option value="">دعوة صديق...</option>${friends.filter(friend => !currentRoom.players.some(player => player.username === friend.username)).map(friend => `<option value="${escapeHtml(friend.username)}">${escapeHtml(friend.displayName || friend.username)}${friend.isOnline ? ' • متصل' : ''}</option>`).join('')}</select><button id="inviteBtn" class="secondary" type="button"><i class="fa-solid fa-user-plus"></i> دعوة</button></div>` : '<div class="muted" style="margin-top:13px">أضف أصدقاء أولًا حتى ترسل دعوة.</div>';
    const manage = currentRoom.players.filter(player => player.username !== me?.username).map(player => `<button class="secondary manage-player" type="button" data-target="${escapeHtml(player.username)}"><i class="fa-solid fa-ellipsis"></i> ${escapeHtml(player.displayName || player.username)}</button>`).join('');
    host.innerHTML = `<div class="current-head"><i class="fa-solid ${icon(currentRoom.gameIcon)}" style="font-size:26px;color:#c5adff"></i><h2>${escapeHtml(currentRoom.name)}</h2><span class="muted">${currentRoom.players.length}/${currentRoom.maxPlayers}</span><button id="leaveGameBtn" class="danger" type="button">مغادرة</button></div><p class="muted">${escapeHtml(currentRoom.gameName)} • الجولة ${currentRoom.round} • ${currentRoom.status === 'playing' ? 'الجولة جارية' : 'بانتظار الاختيارات'}</p><div class="players-grid" style="margin-top:15px">${players || '<div class="empty-box">لاعبون</div>'}</div><div class="game-actions">${currentRoom.players.length >= 2 ? actions : '<span class="muted">انتظر لاعبًا آخر حتى تبدأ اللعبة.</span>'}</div><div id="privateActionText" class="muted" style="text-align:center;min-height:22px">${escapeHtml(privateActionText)}</div><div id="gameResult" class="game-result">${formatResult(currentRoom.lastResult)}</div>${invites}<div class="room-manage">${isOwner && manage ? `<span class="muted">إدارة اللاعبين:</span>${manage}` : ''}</div>`;
    $('leaveGameBtn').onclick = leaveGame;
    host.querySelectorAll('[data-action], [data-choice]').forEach(button => button.addEventListener('click', () => sendAction(button.dataset.action, button.dataset.choice)));
    $('inviteBtn')?.addEventListener('click', () => { const target = $('friendSelect').value; if (!target) return toast('اختَر صديقًا أولًا', true); socket.emit('game:invite', {roomId:currentRoom.roomId, targetUser:target}); });
    host.querySelectorAll('.manage-player').forEach(button => button.addEventListener('click', () => managePlayer(button.dataset.target)));
  }

  function formatResult(result) {
    if (!result) return 'لم تنتهِ أي جولة بعد.';
    const winners = (result.winners || []).map(playerName).join('، ');
    const values = Object.entries(result.values || {}).map(([username, value]) => `${playerName(username)}: ${value}`).join(' • ');
    const winningChoice = result.winningChoice ? `\nالاختيار الرابح: ${choiceIcon(result.winningChoice)} ${result.winningChoice}` : '';
    return `${result.tied ? 'تعادل' : `الفائز: ${winners}`}${winningChoice}\n${values}`;
  }

  function sendAction(action, choice) {
    if (!currentRoom) return;
    const payload = {roomId:currentRoom.roomId};
    if (currentRoom.advanced === 'quiz') payload.answer = Number(choice);
    else if (currentRoom.advanced === 'snakes_ladders') payload.action = action || 'roll';
    else if (currentRoom.action === 'number') payload.value = Number($('numberChoice')?.value);
    else if (currentRoom.action === 'choice') payload.choice = choice;
    socket.emit('game:action', payload);
  }

  function managePlayer(targetUser) {
    if (!currentRoom || currentRoom.owner !== me?.username) return;
    const action = prompt(`اكتب kick لطرد ${targetUser} أو report لإرسال بلاغ:`);
    if (action?.toLowerCase() === 'kick') socket.emit('game:kick', {roomId:currentRoom.roomId, targetUser});
    if (action?.toLowerCase() === 'report') socket.emit('game:report', {roomId:currentRoom.roomId, targetUser, reason:prompt('سبب البلاغ:') || 'إساءة داخل اللعبة'});
  }

  function joinRoom(roomId) { socket.emit('game:join-room', {roomId}); }
  function leaveGame() { if (currentRoom) socket.emit('game:leave-room', {roomId:currentRoom.roomId}); currentRoom = null; dominoPrivate = null; dominoSelectedTileId = ''; unoPrivate = null; unoSelectedCardId = ''; jackarooPrivate = null; jackarooSelectedCardId = ''; privateActionText = ''; renderCurrentRoom(); }

  async function loadInitial() {
    try {
      const [session, catalogData, roomsData, friendsData, invitesData] = await Promise.all([request('/api/session'), request('/api/games/catalog'), request('/api/games/rooms'), request('/api/economy/friends'), request('/api/games/invites')]);
      me = session; $('meName').textContent = '@' + session.username; catalog = catalogData.games || []; rooms = roomsData.rooms || []; friends = friendsData.friends || [];
      renderCatalog(); renderRooms(); renderInvites(invitesData.invites || []);
      socket = io({transports:['websocket','polling']});
      bindSocket();
    } catch (error) { toast(error.message, true); }
  }

  function bindSocket() {
    socket.on('connect', () => { socket.emit('game:list'); socket.emit('game:get-invites'); });
    socket.on('game:rooms', data => { rooms = data || []; renderRooms(); });
    socket.on('game:created', room => { currentRoom = room; dominoPrivate = null; dominoSelectedTileId = ''; unoPrivate = null; unoSelectedCardId = ''; jackarooPrivate = null; jackarooSelectedCardId = ''; socket.emit('game:join-room', {roomId:room.roomId}); renderCurrentRoom(); toast('تم إنشاء غرفة اللعب'); });
    socket.on('game:state', room => { if (currentRoom?.roomId === room.roomId || room.players?.some(player => player.username === me?.username)) { if (currentRoom?.roomId !== room.roomId || !['dominoes', 'uno', 'jackaroo'].includes(room.advanced)) { dominoPrivate = null; dominoSelectedTileId = ''; unoPrivate = null; unoSelectedCardId = ''; jackarooPrivate = null; jackarooSelectedCardId = ''; } currentRoom = room; renderCurrentRoom(); } });
    socket.on('game:domino-private', data => { if (currentRoom?.roomId === data?.roomId) { dominoPrivate = data; renderCurrentRoom(); } });
    socket.on('game:uno-private', data => { if (currentRoom?.roomId === data?.roomId) { unoPrivate = data; renderCurrentRoom(); } });
    socket.on('game:jackaroo-private', data => { if (currentRoom?.roomId === data?.roomId) { jackarooPrivate = data; renderCurrentRoom(); } });
    socket.on('game:invites', renderInvites);
    socket.on('game:invite', invite => { renderInvites([invite]); toast(`${invite.invitedBy} دعاك إلى غرفة لعبة`); });
    socket.on('game:invite-sent', () => toast('تم إرسال الدعوة'));
    socket.on('game:action-result', data => { privateActionText = data.gameType === 'dice_duel' ? `نتيجتك في الجولة: ${data.value}` : data.gameType === 'quiz' ? 'تم تسجيل إجابتك، انتظر النتيجة.' : data.gameType === 'snakes_ladders' ? `نتيجة رميتك: ${data.value}` : data.gameType === 'dominoes' ? 'تم تسجيل حركة الدومنة.' : data.gameType === 'uno' ? 'تم تسجيل حركة UNO.' : data.gameType === 'jackaroo' ? 'تم تسجيل حركة توميرو.' : `تم تسجيل اختيارك: ${data.value}`; $('privateActionText') && ($('privateActionText').textContent = privateActionText); });
    socket.on('game:advanced-result', result => { if (result?.gameType === 'quiz') toast(`الإجابة الصحيحة: ${result.correctText || ''}`); else if (result?.gameType === 'snakes_ladders') toast(result.winner ? `الفائز: ${playerName(result.winner)}` : `${playerName(result.player)} رمى ${result.roll}`); else if (result?.gameType === 'dominoes' && result.type === 'winner') toast(`الفائز: ${playerName(result.winner)}`); else if (result?.gameType === 'dominoes' && result.type === 'blocked') toast('انغلقت الجولة وتم احتساب الأقل نقاطاً'); else if (result?.gameType === 'uno' && result.type === 'winner') toast(`الفائز في UNO: ${playerName(result.winner)}`); else if (result?.gameType === 'jackaroo' && result.type === 'winner') toast(`فاز ${result.winnerTeam === 'team1' ? 'الفريق 1' : 'الفريق 2'} في توميرو`); if (currentRoom) renderCurrentRoom(); });
    socket.on('game:round-result', result => { if ($('gameResult')) $('gameResult').textContent = formatResult(result); toast(result.tied ? 'انتهت الجولة بتعادل' : `الفائز: ${(result.winners || []).map(playerName).join('، ')}`); });
    socket.on('game:kicked', data => { if (currentRoom?.roomId === data.roomId) { currentRoom = null; dominoPrivate = null; dominoSelectedTileId = ''; unoPrivate = null; unoSelectedCardId = ''; jackarooPrivate = null; jackarooSelectedCardId = ''; renderCurrentRoom(); toast(data.message, true); } });
    socket.on('game:left', () => { currentRoom = null; dominoPrivate = null; dominoSelectedTileId = ''; unoPrivate = null; unoSelectedCardId = ''; jackarooPrivate = null; jackarooSelectedCardId = ''; privateActionText = ''; renderCurrentRoom(); });
    socket.on('game:report-result', data => toast(data.message || 'تم إرسال البلاغ'));
    socket.on('game:error', data => toast(data.error || 'تعذر تنفيذ العملية', true));
  }

  $('catalogList').addEventListener('click', event => { const card = event.target.closest('[data-game-type]'); if (card) updateSelectedGame(card.dataset.gameType); });
  $('createGameForm').addEventListener('submit', event => { event.preventDefault(); if (!socket) return; socket.emit('game:create-room', {gameType:event.currentTarget.dataset.gameType || catalog[0]?.id, maxPlayers:Number($('maxPlayers').value), name:$('gameRoomName').value.trim()}); });
  $('roomsList').addEventListener('click', event => { const card = event.target.closest('[data-room-id]'); if (card) joinRoom(card.dataset.roomId); });
  $('invitesList').addEventListener('click', event => { const button = event.target.closest('.accept-invite'); if (button) joinRoom(button.dataset.roomId); });
  $('refreshRoomsBtn').addEventListener('click', () => socket?.emit('game:list'));
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('logoutBtn').addEventListener('click', async () => { await request('/api/logout', {method:'POST', body:'{}'}).catch(() => {}); location.replace('login.html'); });
  loadInitial();
})();
