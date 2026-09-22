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
    select.innerHTML = game.allowedPlayers.map(value => `<option value="${value}">${value === 2 ? 'لاعبان' : 'أربعة لاعبين'}</option>`).join('');
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
    return currentRoom?.players?.find(player => player.username === username)?.displayName || username;
  }

  function renderCurrentRoom() {
    const host = $('currentGame');
    if (!currentRoom) {
      host.innerHTML = '<div class="game-help"><i class="fa-solid fa-dice" style="font-size:44px;color:#bfa9ff"></i><h2>اختَر لعبة أو انضم إلى غرفة</h2><p>اللعب مجاني، والتحكم بالغرفة يكون عند منشئها. يمكنك طرد لاعب أو إرسال بلاغ عند الإساءة.</p></div>';
      return;
    }
    const isOwner = currentRoom.owner === me?.username;
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
    if (currentRoom.action === 'number') payload.value = Number($('numberChoice')?.value);
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
  function leaveGame() { if (currentRoom) socket.emit('game:leave-room', {roomId:currentRoom.roomId}); currentRoom = null; privateActionText = ''; renderCurrentRoom(); }

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
    socket.on('game:created', room => { currentRoom = room; socket.emit('game:join-room', {roomId:room.roomId}); renderCurrentRoom(); toast('تم إنشاء غرفة اللعب'); });
    socket.on('game:state', room => { if (currentRoom?.roomId === room.roomId || room.players?.some(player => player.username === me?.username)) { currentRoom = room; renderCurrentRoom(); } });
    socket.on('game:invites', renderInvites);
    socket.on('game:invite', invite => { renderInvites([invite]); toast(`${invite.invitedBy} دعاك إلى غرفة لعبة`); });
    socket.on('game:invite-sent', () => toast('تم إرسال الدعوة'));
    socket.on('game:action-result', data => { privateActionText = data.gameType === 'dice_duel' ? `نتيجتك في الجولة: ${data.value}` : `تم تسجيل اختيارك: ${data.value}`; $('privateActionText') && ($('privateActionText').textContent = privateActionText); });
    socket.on('game:round-result', result => { if ($('gameResult')) $('gameResult').textContent = formatResult(result); toast(result.tied ? 'انتهت الجولة بتعادل' : `الفائز: ${(result.winners || []).map(playerName).join('، ')}`); });
    socket.on('game:kicked', data => { if (currentRoom?.roomId === data.roomId) { currentRoom = null; renderCurrentRoom(); toast(data.message, true); } });
    socket.on('game:left', () => { currentRoom = null; privateActionText = ''; renderCurrentRoom(); });
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
