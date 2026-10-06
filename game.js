/*
 * Battleship game rules and AI.
 * Pure logic, no DOM or browser APIs, so it can be unit tested in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Battleship = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 10;
  const COLUMNS = 'ABCDEFGHIJ';
  const SHIPS = Object.freeze([
    Object.freeze({ id: 'carrier', name: 'Carrier', length: 5 }),
    Object.freeze({ id: 'battleship', name: 'Battleship', length: 4 }),
    Object.freeze({ id: 'cruiser', name: 'Cruiser', length: 3 }),
    Object.freeze({ id: 'submarine', name: 'Submarine', length: 3 }),
    Object.freeze({ id: 'destroyer', name: 'Destroyer', length: 2 }),
  ]);
  const HORIZONTAL = 'horizontal';
  const VERTICAL = 'vertical';

  function getShipDef(id) {
    const def = SHIPS.find((s) => s.id === id);
    if (!def) throw new Error('Unknown ship: ' + id);
    return def;
  }

  function inBounds(row, col) {
    return Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function coordLabel(row, col) {
    return COLUMNS[col] + (row + 1);
  }

  function matrix(value) {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(value));
  }

  // ---------------------------------------------------------------- Board

  function createBoard() {
    return {
      ships: [],
      // occupancy[r][c] = ship id or null
      occupancy: matrix(null),
      // shots[r][c] = null | 'miss' | 'hit'
      shots: matrix(null),
    };
  }

  function shipCells(row, col, length, orientation) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(orientation === VERTICAL ? [row + i, col] : [row, col + i]);
    }
    return cells;
  }

  function canPlace(board, length, row, col, orientation, ignoreId) {
    if (orientation !== HORIZONTAL && orientation !== VERTICAL) return false;
    return shipCells(row, col, length, orientation).every(([r, c]) =>
      inBounds(r, c) &&
      (board.occupancy[r][c] === null || board.occupancy[r][c] === ignoreId));
  }

  function removeShip(board, id) {
    const index = board.ships.findIndex((s) => s.id === id);
    if (index === -1) return false;
    for (const [r, c] of board.ships[index].cells) board.occupancy[r][c] = null;
    board.ships.splice(index, 1);
    return true;
  }

  // Places (or moves) a ship. Returns true on success; the board is unchanged on failure.
  function placeShip(board, id, row, col, orientation) {
    const def = getShipDef(id);
    if (!canPlace(board, def.length, row, col, orientation, id)) return false;
    removeShip(board, id);
    const cells = shipCells(row, col, def.length, orientation);
    for (const [r, c] of cells) board.occupancy[r][c] = id;
    board.ships.push({
      id: def.id, name: def.name, length: def.length,
      row, col, orientation, cells, hits: 0,
    });
    return true;
  }

  function clearBoard(board) {
    board.ships = [];
    board.occupancy = matrix(null);
    board.shots = matrix(null);
  }

  function randomInt(rng, n) {
    return Math.floor(rng() * n);
  }

  function placeShipsRandomly(board, rng) {
    rng = rng || Math.random;
    clearBoard(board);
    for (const def of SHIPS) {
      for (;;) {
        const orientation = rng() < 0.5 ? HORIZONTAL : VERTICAL;
        const row = randomInt(rng, SIZE);
        const col = randomInt(rng, SIZE);
        if (placeShip(board, def.id, row, col, orientation)) break;
      }
    }
    return board;
  }

  function allShipsPlaced(board) {
    return SHIPS.every((def) => board.ships.some((s) => s.id === def.id));
  }

  function getShip(board, id) {
    return board.ships.find((s) => s.id === id) || null;
  }

  function isSunk(ship) {
    return ship.hits >= ship.length;
  }

  function allSunk(board) {
    return board.ships.length > 0 && board.ships.every(isSunk);
  }

  function sunkShips(board) {
    return board.ships.filter(isSunk).map((s) => s.id);
  }

  /*
   * Fires at a board. Result:
   *   { valid: false, reason: 'out-of-bounds' | 'repeat' }
   *   { valid: true, row, col, result: 'miss' | 'hit' | 'sunk', ship?, gameOver }
   * `ship` ({ id, name, length, cells }) is only included when a ship is sunk,
   * matching what a real opponent would announce.
   */
  function receiveShot(board, row, col) {
    if (!inBounds(row, col)) return { valid: false, reason: 'out-of-bounds' };
    if (board.shots[row][col] !== null) return { valid: false, reason: 'repeat' };
    const id = board.occupancy[row][col];
    if (id === null) {
      board.shots[row][col] = 'miss';
      return { valid: true, row, col, result: 'miss', gameOver: false };
    }
    board.shots[row][col] = 'hit';
    const ship = getShip(board, id);
    ship.hits += 1;
    if (isSunk(ship)) {
      return {
        valid: true, row, col, result: 'sunk',
        ship: { id: ship.id, name: ship.name, length: ship.length, cells: ship.cells.map((c) => c.slice()) },
        gameOver: allSunk(board),
      };
    }
    return { valid: true, row, col, result: 'hit', gameOver: false };
  }

  // ------------------------------------------------------------------- AI
  //
  // The AI only tracks what a human opponent would know: where it fired,
  // whether each shot was a hit or miss, and the type of ship when one sinks.

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function createAI(rng) {
    rng = rng || Math.random;
    return {
      rng,
      // knowledge[r][c] = null (unknown) | 'miss' | 'hit' (unresolved) | 'sunk'
      knowledge: matrix(null),
      // unresolved hits in the order they happened: [{ row, col, turn }]
      openHits: [],
      remaining: SHIPS.map((s) => s.length),
      parity: randomInt(rng, 2),
      turn: 0,
      mode: 'hunt',
    };
  }

  function isUnknown(ai, r, c) {
    return inBounds(r, c) && ai.knowledge[r][c] === null;
  }

  // Could some remaining ship cover (r, c) along the given axis, passing only
  // through unknown or unresolved-hit cells?
  function fitsThrough(ai, r, c, dr, dc) {
    const passable = (rr, cc) => inBounds(rr, cc) &&
      (ai.knowledge[rr][cc] === null || ai.knowledge[rr][cc] === 'hit');
    let span = 1;
    for (let k = 1; passable(r - dr * k, c - dc * k); k++) span++;
    for (let k = 1; passable(r + dr * k, c + dc * k); k++) span++;
    return ai.remaining.some((len) => len <= span);
  }

  // Contiguous run of unresolved hits through (r, c) along an axis.
  function hitRun(ai, r, c, dr, dc) {
    const isHit = (rr, cc) => inBounds(rr, cc) && ai.knowledge[rr][cc] === 'hit';
    let start = 0;
    let end = 0;
    while (isHit(r - dr * (start + 1), c - dc * (start + 1))) start++;
    while (isHit(r + dr * (end + 1), c + dc * (end + 1))) end++;
    return {
      length: start + end + 1,
      before: [r - dr * (start + 1), c - dc * (start + 1)],
      after: [r + dr * (end + 1), c + dc * (end + 1)],
    };
  }

  function targetCandidates(ai) {
    const recentFirst = ai.openHits.slice().sort((a, b) => b.turn - a.turn);

    // 1. Two or more hits in a row: keep following that line.
    for (const h of recentFirst) {
      const lines = [[0, 1], [1, 0]]
        .map(([dr, dc]) => ({ dr, dc, run: hitRun(ai, h.row, h.col, dr, dc) }))
        .filter((l) => l.run.length >= 2)
        .sort((a, b) => b.run.length - a.run.length);
      for (const { dr, dc, run } of lines) {
        const ends = [run.before, run.after].filter(([r, c]) => isUnknown(ai, r, c));
        if (ends.length && fitsThrough(ai, h.row, h.col, dr, dc)) return ends;
      }
    }

    // 2. Single hit (or a blocked line): try the neighbours.
    for (const h of recentFirst) {
      const options = DIRS
        .map(([dr, dc]) => [h.row + dr, h.col + dc, dr, dc])
        .filter(([r, c, dr, dc]) => isUnknown(ai, r, c) && fitsThrough(ai, h.row, h.col, Math.abs(dr), Math.abs(dc)))
        .map(([r, c]) => [r, c]);
      if (options.length) return options;
    }
    for (const h of recentFirst) {
      const options = DIRS
        .map(([dr, dc]) => [h.row + dr, h.col + dc])
        .filter(([r, c]) => isUnknown(ai, r, c));
      if (options.length) return options;
    }
    return [];
  }

  function huntCandidates(ai) {
    const minLen = Math.min(...ai.remaining);
    const all = [];
    const checker = [];
    const checkerFits = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (ai.knowledge[r][c] !== null) continue;
        all.push([r, c]);
        if ((r + c) % 2 !== ai.parity) continue;
        checker.push([r, c]);
        const fits = [[0, 1], [1, 0]].some(([dr, dc]) => {
          let span = 1;
          for (let k = 1; isUnknown(ai, r - dr * k, c - dc * k); k++) span++;
          for (let k = 1; isUnknown(ai, r + dr * k, c + dc * k); k++) span++;
          return span >= minLen;
        });
        if (fits) checkerFits.push([r, c]);
      }
    }
    if (checkerFits.length) return checkerFits;
    if (checker.length) return checker;
    return all;
  }

  // Returns { row, col } of an unfired square, or null if none remain.
  function chooseShot(ai) {
    let candidates = ai.openHits.length ? targetCandidates(ai) : [];
    ai.mode = candidates.length ? 'target' : 'hunt';
    if (!candidates.length) candidates = huntCandidates(ai);
    if (!candidates.length) return null;
    const [row, col] = candidates[randomInt(ai.rng, candidates.length)];
    return { row, col };
  }

  // When a ship of `length` sinks at (r, c), work out which unresolved hits it
  // covered, preferring the segment made of the most recent hits.
  function resolveSunk(ai, r, c, length) {
    const turnOf = new Map(ai.openHits.map((h) => [h.row * SIZE + h.col, h.turn]));
    let best = null;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      for (let offset = -(length - 1); offset <= 0; offset++) {
        const cells = [];
        for (let i = 0; i < length; i++) {
          cells.push([r + dr * (offset + i), c + dc * (offset + i)]);
        }
        if (!cells.every(([rr, cc]) => inBounds(rr, cc) && ai.knowledge[rr][cc] === 'hit')) continue;
        const score = cells.reduce((sum, [rr, cc]) => sum + turnOf.get(rr * SIZE + cc), 0);
        if (!best || score > best.score) best = { cells, score };
      }
    }
    const cells = best ? best.cells : [[r, c]];
    for (const [rr, cc] of cells) ai.knowledge[rr][cc] = 'sunk';
    ai.openHits = ai.openHits.filter((h) => ai.knowledge[h.row][h.col] === 'hit');
  }

  function recordResult(ai, row, col, result, ship) {
    ai.turn += 1;
    if (result === 'miss') {
      ai.knowledge[row][col] = 'miss';
      return;
    }
    ai.knowledge[row][col] = 'hit';
    ai.openHits.push({ row, col, turn: ai.turn });
    if (result === 'sunk' && ship) {
      const i = ai.remaining.indexOf(ship.length);
      if (i !== -1) ai.remaining.splice(i, 1);
      resolveSunk(ai, row, col, ship.length);
    }
  }

  // ----------------------------------------------------------------- Game

  function createGame(options) {
    const rng = (options && options.rng) || Math.random;
    const ai = createBoard();
    placeShipsRandomly(ai, rng);
    return {
      phase: 'setup', // 'setup' | 'battle' | 'over'
      turn: 'player', // 'player' | 'ai'
      winner: null,
      player: createBoard(),
      ai,
      brain: createAI(rng),
      log: [],
    };
  }

  function startBattle(game) {
    if (game.phase !== 'setup' || !allShipsPlaced(game.player)) return false;
    game.phase = 'battle';
    game.turn = 'player';
    return true;
  }

  function describe(shooter, res) {
    const at = coordLabel(res.row, res.col);
    const who = shooter === 'player' ? 'You' : 'Computer';
    if (res.result === 'miss') return `${who} fired at ${at}: miss.`;
    if (res.result === 'hit') return `${who} fired at ${at}: hit!`;
    const whose = shooter === 'player' ? 'the enemy' : 'your';
    return `${who} fired at ${at}: hit and sank ${whose} ${res.ship.name}!`;
  }

  function finishShot(game, shooter, res) {
    res.message = describe(shooter, res);
    game.log.push({ shooter, ...res });
    if (res.gameOver) {
      game.phase = 'over';
      game.winner = shooter;
    } else {
      game.turn = shooter === 'player' ? 'ai' : 'player';
    }
    return res;
  }

  // Human fires at the AI board. Invalid or repeat shots don't use up the turn.
  function playerFire(game, row, col) {
    if (game.phase !== 'battle') return { valid: false, reason: 'not-in-battle' };
    if (game.turn !== 'player') return { valid: false, reason: 'not-your-turn' };
    const res = receiveShot(game.ai, row, col);
    if (!res.valid) return res;
    return finishShot(game, 'player', res);
  }

  function aiFire(game) {
    if (game.phase !== 'battle') return { valid: false, reason: 'not-in-battle' };
    if (game.turn !== 'ai') return { valid: false, reason: 'not-your-turn' };
    const shot = chooseShot(game.brain);
    if (!shot) return { valid: false, reason: 'no-moves' };
    const res = receiveShot(game.player, shot.row, shot.col);
    if (!res.valid) throw new Error('AI chose an invalid shot at ' + coordLabel(shot.row, shot.col));
    recordResult(game.brain, res.row, res.col, res.result, res.ship);
    return finishShot(game, 'ai', res);
  }

  return {
    SIZE, COLUMNS, SHIPS, HORIZONTAL, VERTICAL,
    getShipDef, inBounds, coordLabel,
    createBoard, shipCells, canPlace, placeShip, removeShip, clearBoard,
    placeShipsRandomly, allShipsPlaced, getShip, isSunk, allSunk, sunkShips, receiveShot,
    createAI, chooseShot, recordResult,
    createGame, startBattle, playerFire, aiFire,
  };
});
