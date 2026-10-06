/* Browser interface for Battleship vs AI. All rules live in game.js. */
(function () {
  'use strict';

  const B = window.Battleship;
  const AI_DELAY_MIN = 650;
  const AI_DELAY_MAX = 1100;

  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('status'),
    setup: $('setup'),
    picker: $('ship-picker'),
    rotateBtn: $('rotate-btn'),
    orientationLabel: $('orientation-label'),
    randomBtn: $('random-btn'),
    clearBtn: $('clear-btn'),
    startBtn: $('start-btn'),
    playerBoard: $('player-board'),
    enemyBoard: $('enemy-board'),
    playerLosses: $('player-losses'),
    enemyLosses: $('enemy-losses'),
    log: $('log'),
    result: $('result'),
    resultTitle: $('result-title'),
    resultText: $('result-text'),
    playAgainBtn: $('play-again-btn'),
  };

  let game;
  let selectedId;
  let orientation;
  let aiTimer = null;
  let previewAt = null; // { row, col } currently previewed on the player board
  let lastShot = { player: null, ai: null };
  let renderedLog = 0;
  let statusOverride = null;

  const playerCells = buildBoard(els.playerBoard);
  const enemyCells = buildBoard(els.enemyBoard);
  buildPicker();

  // ------------------------------------------------------------ Building

  function buildBoard(container) {
    const cells = [];
    container.appendChild(document.createElement('span'));
    for (let c = 0; c < B.SIZE; c++) {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = B.COLUMNS[c];
      label.setAttribute('aria-hidden', 'true');
      container.appendChild(label);
    }
    for (let r = 0; r < B.SIZE; r++) {
      const rowLabel = document.createElement('span');
      rowLabel.className = 'label';
      rowLabel.textContent = String(r + 1);
      rowLabel.setAttribute('aria-hidden', 'true');
      container.appendChild(rowLabel);
      cells.push([]);
      for (let c = 0; c < B.SIZE; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.tabIndex = r === 0 && c === 0 ? 0 : -1;
        container.appendChild(btn);
        cells[r].push(btn);
      }
    }
    container.addEventListener('keydown', (e) => moveFocus(e, cells));
    container.addEventListener('focusin', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      for (const row of cells) for (const b of row) b.tabIndex = -1;
      cell.tabIndex = 0;
    });
    return cells;
  }

  function buildPicker() {
    for (const ship of B.SHIPS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ship-option';
      btn.setAttribute('role', 'radio');
      btn.dataset.id = ship.id;
      const blocks = '<i></i>'.repeat(ship.length);
      btn.innerHTML = `<span class="ship-blocks" aria-hidden="true">${blocks}</span>` +
        `<span class="ship-name">${ship.name}</span> <span class="ship-len">(${ship.length})</span>`;
      btn.addEventListener('click', () => selectShip(ship.id));
      els.picker.appendChild(btn);
    }
    els.picker.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const ids = B.SHIPS.map((s) => s.id);
      const i = (ids.indexOf(selectedId) + keys[e.key] + ids.length) % ids.length;
      selectShip(ids[i]);
      els.picker.querySelector(`[data-id="${ids[i]}"]`).focus();
    });
  }

  function moveFocus(e, cells) {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    let r = Number(cell.dataset.row);
    let c = Number(cell.dataset.col);
    switch (e.key) {
      case 'ArrowUp': r = Math.max(0, r - 1); break;
      case 'ArrowDown': r = Math.min(B.SIZE - 1, r + 1); break;
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'ArrowRight': c = Math.min(B.SIZE - 1, c + 1); break;
      case 'Home': c = 0; break;
      case 'End': c = B.SIZE - 1; break;
      default: return;
    }
    e.preventDefault();
    cells[r][c].focus();
  }

  function cellFromEvent(e) {
    const cell = e.target.closest && e.target.closest('.cell');
    return cell ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
  }

  // --------------------------------------------------------------- Setup

  function selectShip(id) {
    selectedId = id;
    statusOverride = null;
    render();
  }

  function nextUnplaced() {
    const def = B.SHIPS.find((s) => !B.getShip(game.player, s.id));
    return def ? def.id : null;
  }

  function rotate() {
    if (game.phase !== 'setup') return;
    orientation = orientation === B.HORIZONTAL ? B.VERTICAL : B.HORIZONTAL;
    render();
  }

  function handlePlayerBoardClick(e) {
    if (game.phase !== 'setup') return;
    const at = cellFromEvent(e);
    if (!at) return;
    const occupant = game.player.occupancy[at.row][at.col];
    const label = B.coordLabel(at.row, at.col);

    if (selectedId) {
      const def = B.getShipDef(selectedId);
      if (B.placeShip(game.player, selectedId, at.row, at.col, orientation)) {
        statusOverride = `${def.name} placed at ${label}.`;
        selectedId = nextUnplaced();
        render();
        return;
      }
    }
    if (occupant) {
      const ship = B.getShip(game.player, occupant);
      B.removeShip(game.player, occupant);
      selectedId = occupant;
      orientation = ship.orientation;
      statusOverride = `Picked up your ${ship.name}. Click a square to place it again.`;
    } else if (selectedId) {
      statusOverride = `The ${B.getShipDef(selectedId).name} doesn't fit at ${label}. Try another square or rotate.`;
    } else {
      statusOverride = 'All ships are placed. Click a ship to move it, or start the battle.';
    }
    render();
  }

  function setPreview(at) {
    previewAt = at;
    renderPreview();
  }

  function renderPreview() {
    for (const row of playerCells) for (const b of row) b.classList.remove('preview-ok', 'preview-bad');
    if (game.phase !== 'setup' || !selectedId || !previewAt) return;
    const def = B.getShipDef(selectedId);
    const ok = B.canPlace(game.player, def.length, previewAt.row, previewAt.col, orientation, selectedId);
    for (const [r, c] of B.shipCells(previewAt.row, previewAt.col, def.length, orientation)) {
      if (B.inBounds(r, c)) playerCells[r][c].classList.add(ok ? 'preview-ok' : 'preview-bad');
    }
  }

  function placeRandomly() {
    if (game.phase !== 'setup') return;
    B.placeShipsRandomly(game.player);
    selectedId = null;
    statusOverride = 'Ships placed randomly. Press "Start battle" when ready.';
    render();
  }

  function clearShips() {
    if (game.phase !== 'setup') return;
    B.clearBoard(game.player);
    selectedId = B.SHIPS[0].id;
    statusOverride = 'Board cleared.';
    render();
  }

  function startBattle() {
    if (!B.startBattle(game)) return;
    statusOverride = null;
    previewAt = null;
    addLog('Battle started. You fire first.', 'big');
    render();
    enemyCells[0][0].focus();
  }

  // -------------------------------------------------------------- Battle

  function handleEnemyBoardClick(e) {
    const at = cellFromEvent(e);
    if (!at || game.phase !== 'battle' || game.turn !== 'player') return;
    const res = B.playerFire(game, at.row, at.col);
    if (!res.valid) {
      if (res.reason === 'repeat') {
        statusOverride = `You already fired at ${B.coordLabel(at.row, at.col)}. Pick another square.`;
        render();
      }
      return;
    }
    lastShot.player = at;
    statusOverride = null;
    render();
    if (game.phase === 'over') {
      endGame();
      return;
    }
    const delay = AI_DELAY_MIN + Math.random() * (AI_DELAY_MAX - AI_DELAY_MIN);
    aiTimer = setTimeout(aiTurn, delay);
  }

  function aiTurn() {
    aiTimer = null;
    const res = B.aiFire(game);
    if (!res.valid) return;
    lastShot.ai = { row: res.row, col: res.col };
    render();
    if (game.phase === 'over') endGame();
  }

  function endGame() {
    const won = game.winner === 'player';
    const shots = game.log.filter((l) => l.shooter === game.winner).length;
    addLog(won ? 'You sank the entire enemy fleet!' : 'The computer sank your entire fleet.', 'big');
    render();
    els.resultTitle.textContent = won ? 'You win!' : 'You lose';
    els.resultText.textContent = won
      ? `You sank all five enemy ships in ${shots} shots.`
      : `The computer sank all five of your ships in ${shots} shots.`;
    els.result.hidden = false;
    els.playAgainBtn.focus();
  }

  function newGame() {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = null;
    game = B.createGame();
    selectedId = B.SHIPS[0].id;
    orientation = B.HORIZONTAL;
    previewAt = null;
    lastShot = { player: null, ai: null };
    renderedLog = 0;
    statusOverride = null;
    els.log.innerHTML = '';
    els.result.hidden = true;
    render();
  }

  // ------------------------------------------------------------ Rendering

  function addLog(text, extraClass) {
    const li = document.createElement('li');
    li.textContent = text;
    if (extraClass) li.className = extraClass;
    els.log.appendChild(li);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function syncLog() {
    while (renderedLog < game.log.length) {
      const entry = game.log[renderedLog++];
      const cls = (entry.shooter === 'ai' ? 'from-ai' : 'from-player') + (entry.result === 'sunk' ? ' big' : '');
      addLog(entry.message, cls);
    }
  }

  function statusText() {
    if (statusOverride) return statusOverride;
    if (game.phase === 'setup') {
      const placed = game.player.ships.length;
      if (placed === B.SHIPS.length) return 'All ships placed. Press "Start battle"!';
      const name = selectedId ? B.getShipDef(selectedId).name : 'a ship';
      return `Place your ships (${placed} of ${B.SHIPS.length}). Now placing: ${name}.`;
    }
    if (game.phase === 'over') return game.winner === 'player' ? 'You win! All enemy ships sunk.' : 'You lose. Your fleet was sunk.';
    const last = game.log[game.log.length - 1];
    const prefix = last ? last.message + ' ' : '';
    return game.turn === 'player'
      ? prefix + 'Your turn: fire at the enemy board.'
      : prefix + "Computer's turn: aiming...";
  }

  function renderPlayerBoard() {
    const board = game.player;
    const setup = game.phase === 'setup';
    for (let r = 0; r < B.SIZE; r++) {
      for (let c = 0; c < B.SIZE; c++) {
        const btn = playerCells[r][c];
        const id = board.occupancy[r][c];
        const ship = id && B.getShip(board, id);
        const shot = board.shots[r][c];
        const sunk = ship && B.isSunk(ship);
        btn.className = 'cell';
        if (ship) btn.classList.add('ship');
        if (shot === 'miss') btn.classList.add('miss');
        if (shot === 'hit') btn.classList.add(sunk ? 'sunk' : 'hit');
        const last = lastShot.ai;
        if (last && last.row === r && last.col === c) btn.classList.add('last-shot');
        let label = B.coordLabel(r, c) + ', ';
        if (ship) label += `your ${ship.name}`;
        else label += 'water';
        if (shot === 'miss') label += ', computer missed';
        if (shot === 'hit') label += sunk ? ', sunk' : ', hit';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-disabled', setup ? 'false' : 'true');
      }
    }
    els.playerBoard.classList.toggle('interactive', setup);
    renderPreview();
  }

  function renderEnemyBoard() {
    const board = game.ai;
    const canFire = game.phase === 'battle' && game.turn === 'player';
    const reveal = game.phase === 'over';
    for (let r = 0; r < B.SIZE; r++) {
      for (let c = 0; c < B.SIZE; c++) {
        const btn = enemyCells[r][c];
        const shot = board.shots[r][c];
        const id = board.occupancy[r][c];
        const ship = id && B.getShip(board, id);
        const sunk = shot === 'hit' && ship && B.isSunk(ship);
        btn.className = 'cell';
        let label = B.coordLabel(r, c) + ', ';
        if (shot === 'miss') { btn.classList.add('miss'); label += 'miss'; }
        else if (sunk) { btn.classList.add('sunk'); label += `hit, sunk ${ship.name}`; }
        else if (shot === 'hit') { btn.classList.add('hit'); label += 'hit'; }
        else if (reveal && ship) { btn.classList.add('ship'); label += `enemy ${ship.name}, not found`; }
        else label += 'not fired at';
        const last = lastShot.player;
        if (last && last.row === r && last.col === c) btn.classList.add('last-shot');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-disabled', canFire && !shot ? 'false' : 'true');
      }
    }
    els.enemyBoard.classList.toggle('interactive', canFire);
    els.enemyBoard.classList.toggle('locked', !canFire);
    els.enemyBoard.setAttribute('aria-busy', game.phase === 'battle' && game.turn === 'ai' ? 'true' : 'false');
  }

  function renderLosses(listEl, board) {
    listEl.innerHTML = '';
    for (const def of B.SHIPS) {
      const ship = B.getShip(board, def.id);
      const lost = !!ship && B.isSunk(ship);
      const li = document.createElement('li');
      li.textContent = `${def.name} (${def.length})`;
      li.className = lost ? 'lost' : '';
      li.setAttribute('aria-label', `${def.name}: ${lost ? 'sunk' : 'afloat'}`);
      listEl.appendChild(li);
    }
  }

  function render() {
    const setup = game.phase === 'setup';
    els.setup.hidden = !setup;
    for (const btn of els.picker.children) {
      const id = btn.dataset.id;
      const selected = id === selectedId;
      btn.setAttribute('aria-checked', String(selected));
      btn.tabIndex = selected || (!selectedId && id === B.SHIPS[0].id) ? 0 : -1;
      btn.classList.toggle('placed', !!B.getShip(game.player, id));
    }
    els.orientationLabel.textContent = orientation === B.HORIZONTAL ? 'Horizontal' : 'Vertical';
    els.startBtn.disabled = !B.allShipsPlaced(game.player);
    renderPlayerBoard();
    renderEnemyBoard();
    renderLosses(els.playerLosses, game.player);
    renderLosses(els.enemyLosses, game.ai);
    syncLog();
    els.status.textContent = statusText();
  }

  // -------------------------------------------------------------- Events

  els.playerBoard.addEventListener('click', handlePlayerBoardClick);
  els.playerBoard.addEventListener('mouseover', (e) => { const at = cellFromEvent(e); if (at) setPreview(at); });
  els.playerBoard.addEventListener('mouseleave', () => setPreview(null));
  els.playerBoard.addEventListener('focusin', (e) => { const at = cellFromEvent(e); if (at) setPreview(at); });
  els.playerBoard.addEventListener('focusout', (e) => {
    if (!els.playerBoard.contains(e.relatedTarget)) setPreview(null);
  });
  els.enemyBoard.addEventListener('click', handleEnemyBoardClick);

  els.rotateBtn.addEventListener('click', rotate);
  els.randomBtn.addEventListener('click', placeRandomly);
  els.clearBtn.addEventListener('click', clearShips);
  els.startBtn.addEventListener('click', startBattle);
  els.playAgainBtn.addEventListener('click', () => {
    newGame();
    els.picker.querySelector('[aria-checked="true"]').focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'r' || e.key === 'R') && game.phase === 'setup') {
      e.preventDefault();
      rotate();
    }
    // Keep keyboard focus inside the result dialog while it is open.
    if (e.key === 'Tab' && !els.result.hidden) {
      e.preventDefault();
      els.playAgainBtn.focus();
    }
  });

  newGame();
})();
