'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../game.js');

// Small deterministic PRNG (mulberry32) so failures are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boardWithFleet() {
  const board = B.createBoard();
  B.placeShip(board, 'carrier', 0, 0, B.HORIZONTAL);
  B.placeShip(board, 'battleship', 2, 0, B.HORIZONTAL);
  B.placeShip(board, 'cruiser', 4, 0, B.HORIZONTAL);
  B.placeShip(board, 'submarine', 6, 0, B.HORIZONTAL);
  B.placeShip(board, 'destroyer', 8, 0, B.HORIZONTAL);
  return board;
}

function readyGame(seed) {
  const game = B.createGame({ rng: seeded(seed) });
  B.placeShipsRandomly(game.player, seeded(seed + 1000));
  assert.equal(B.startBattle(game), true);
  return game;
}

test('fleet has the five standard ships', () => {
  assert.deepEqual(B.SHIPS.map((s) => [s.name, s.length]), [
    ['Carrier', 5], ['Battleship', 4], ['Cruiser', 3], ['Submarine', 3], ['Destroyer', 2],
  ]);
});

test('coordinate labels use letters for columns and numbers for rows', () => {
  assert.equal(B.coordLabel(0, 0), 'A1');
  assert.equal(B.coordLabel(9, 9), 'J10');
  assert.equal(B.coordLabel(4, 2), 'C5');
});

test('places horizontal and vertical ships on the correct cells', () => {
  const board = B.createBoard();
  assert.equal(B.placeShip(board, 'cruiser', 2, 3, B.HORIZONTAL), true);
  assert.deepEqual(B.getShip(board, 'cruiser').cells, [[2, 3], [2, 4], [2, 5]]);
  assert.equal(B.placeShip(board, 'destroyer', 5, 5, B.VERTICAL), true);
  assert.deepEqual(B.getShip(board, 'destroyer').cells, [[5, 5], [6, 5]]);
  assert.equal(board.occupancy[2][4], 'cruiser');
  assert.equal(board.occupancy[6][5], 'destroyer');
});

test('rejects ships that go off the board', () => {
  const board = B.createBoard();
  assert.equal(B.placeShip(board, 'carrier', 0, 6, B.HORIZONTAL), false);
  assert.equal(B.placeShip(board, 'carrier', 6, 0, B.VERTICAL), false);
  assert.equal(B.placeShip(board, 'destroyer', -1, 0, B.HORIZONTAL), false);
  assert.equal(B.placeShip(board, 'destroyer', 0, 10, B.HORIZONTAL), false);
  assert.equal(board.ships.length, 0);
  // Exactly touching the edge is fine.
  assert.equal(B.placeShip(board, 'carrier', 0, 5, B.HORIZONTAL), true);
  assert.equal(B.placeShip(board, 'battleship', 6, 9, B.VERTICAL), true);
});

test('rejects overlapping ships and leaves the board unchanged', () => {
  const board = B.createBoard();
  B.placeShip(board, 'carrier', 3, 1, B.HORIZONTAL);
  assert.equal(B.canPlace(board, 4, 0, 3, B.VERTICAL), false);
  assert.equal(B.placeShip(board, 'battleship', 0, 3, B.VERTICAL), false);
  assert.equal(B.getShip(board, 'battleship'), null);
  assert.equal(board.occupancy[0][3], null);
  // Adjacent (touching) is allowed.
  assert.equal(B.placeShip(board, 'battleship', 4, 1, B.HORIZONTAL), true);
});

test('rejects invalid orientation and unknown ships', () => {
  const board = B.createBoard();
  assert.equal(B.placeShip(board, 'destroyer', 0, 0, 'diagonal'), false);
  assert.throws(() => B.placeShip(board, 'rowboat', 0, 0, B.HORIZONTAL));
});

test('placing a ship again moves it, including onto its own old cells', () => {
  const board = B.createBoard();
  B.placeShip(board, 'cruiser', 0, 0, B.HORIZONTAL);
  assert.equal(B.placeShip(board, 'cruiser', 0, 1, B.HORIZONTAL), true);
  assert.equal(board.ships.length, 1);
  assert.equal(board.occupancy[0][0], null);
  assert.equal(board.occupancy[0][3], 'cruiser');
});

test('removeShip and clearBoard empty the board', () => {
  const board = boardWithFleet();
  assert.equal(B.allShipsPlaced(board), true);
  assert.equal(B.removeShip(board, 'carrier'), true);
  assert.equal(B.allShipsPlaced(board), false);
  assert.equal(board.occupancy[0][0], null);
  B.clearBoard(board);
  assert.equal(board.ships.length, 0);
  assert.ok(board.occupancy.every((row) => row.every((v) => v === null)));
});

test('random placement always produces a valid, complete fleet', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const board = B.placeShipsRandomly(B.createBoard(), seeded(seed));
    assert.equal(B.allShipsPlaced(board), true);
    let occupied = 0;
    for (const ship of board.ships) {
      for (const [r, c] of ship.cells) {
        assert.ok(B.inBounds(r, c));
        assert.equal(board.occupancy[r][c], ship.id);
      }
      occupied += ship.length;
    }
    const count = board.occupancy.flat().filter((v) => v !== null).length;
    assert.equal(count, occupied, 'ships must not overlap');
    assert.equal(count, 17);
  }
});

test('shots report miss and hit', () => {
  const board = boardWithFleet();
  assert.deepEqual(
    { ...B.receiveShot(board, 9, 9) },
    { valid: true, row: 9, col: 9, result: 'miss', gameOver: false },
  );
  const hit = B.receiveShot(board, 0, 0);
  assert.equal(hit.result, 'hit');
  assert.equal(hit.ship, undefined, 'a hit must not reveal which ship was struck');
});

test('repeat and out-of-bounds shots are rejected without changing state', () => {
  const board = boardWithFleet();
  B.receiveShot(board, 0, 0);
  B.receiveShot(board, 9, 9);
  assert.deepEqual(B.receiveShot(board, 0, 0), { valid: false, reason: 'repeat' });
  assert.deepEqual(B.receiveShot(board, 9, 9), { valid: false, reason: 'repeat' });
  assert.deepEqual(B.receiveShot(board, 10, 0), { valid: false, reason: 'out-of-bounds' });
  assert.equal(B.getShip(board, 'carrier').hits, 1);
});

test('a repeat shot does not use up the player turn', () => {
  const game = readyGame(7);
  const first = B.playerFire(game, 0, 0);
  assert.equal(first.valid, true);
  assert.equal(game.turn, 'ai');
  B.aiFire(game);
  assert.equal(game.turn, 'player');
  const repeat = B.playerFire(game, 0, 0);
  assert.deepEqual(repeat, { valid: false, reason: 'repeat' });
  assert.equal(game.turn, 'player');
  assert.equal(game.log.length, 2);
});

test('players cannot fire out of turn or before the battle starts', () => {
  const game = B.createGame({ rng: seeded(3) });
  assert.equal(B.playerFire(game, 0, 0).reason, 'not-in-battle');
  assert.equal(B.startBattle(game), false, 'cannot start without all ships placed');
  B.placeShipsRandomly(game.player, seeded(4));
  assert.equal(B.startBattle(game), true);
  assert.equal(B.aiFire(game).reason, 'not-your-turn');
  B.playerFire(game, 0, 0);
  assert.equal(B.playerFire(game, 1, 1).reason, 'not-your-turn');
});

test('sinking a ship reports the ship only when its last cell is hit', () => {
  const board = boardWithFleet();
  assert.equal(B.receiveShot(board, 8, 0).result, 'hit');
  const res = B.receiveShot(board, 8, 1);
  assert.equal(res.result, 'sunk');
  assert.equal(res.ship.id, 'destroyer');
  assert.equal(res.ship.length, 2);
  assert.equal(res.gameOver, false);
  assert.deepEqual(B.sunkShips(board), ['destroyer']);
});

test('game ends when every ship is sunk', () => {
  const board = boardWithFleet();
  const cells = board.ships.flatMap((s) => s.cells);
  let last;
  for (const [r, c] of cells) {
    assert.equal(B.allSunk(board), false);
    last = B.receiveShot(board, r, c);
  }
  assert.equal(last.result, 'sunk');
  assert.equal(last.gameOver, true);
  assert.equal(B.allSunk(board), true);
});

test('game phase becomes over with the right winner and blocks further shots', () => {
  const game = readyGame(11);
  const targets = game.ai.ships.flatMap((s) => s.cells);
  while (game.phase === 'battle') {
    if (game.turn === 'player') {
      const [r, c] = targets.shift();
      B.playerFire(game, r, c);
    } else {
      B.aiFire(game);
    }
  }
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 'player');
  assert.equal(B.playerFire(game, 9, 9).valid, false);
  assert.equal(B.aiFire(game).valid, false);
});

test('AI follows up a hit by firing at a neighbouring square', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const ai = B.createAI(seeded(seed));
    B.recordResult(ai, 5, 5, 'hit');
    const shot = B.chooseShot(ai);
    assert.equal(Math.abs(shot.row - 5) + Math.abs(shot.col - 5), 1);
    assert.equal(ai.mode, 'target');
  }
});

test('AI keeps following a line after two hits in a row', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const ai = B.createAI(seeded(seed));
    B.recordResult(ai, 4, 4, 'hit');
    B.recordResult(ai, 4, 5, 'hit');
    const shot = B.chooseShot(ai);
    assert.equal(shot.row, 4);
    assert.ok(shot.col === 3 || shot.col === 6, `expected C/G on row 5, got col ${shot.col}`);
    // Miss on one end -> try the other end.
    B.recordResult(ai, 4, 6, 'miss');
    assert.deepEqual(B.chooseShot(ai), { row: 4, col: 3 });
  }
});

test('AI hunts on a checkerboard pattern when it has no open hits', () => {
  const ai = B.createAI(seeded(5));
  const parities = new Set();
  for (let i = 0; i < 30; i++) {
    const shot = B.chooseShot(ai);
    assert.equal(ai.mode, 'hunt');
    parities.add((shot.row + shot.col) % 2);
    B.recordResult(ai, shot.row, shot.col, 'miss');
  }
  assert.equal(parities.size, 1);
});

test('AI returns to hunting after sinking the ship it was targeting', () => {
  const ai = B.createAI(seeded(9));
  B.recordResult(ai, 0, 0, 'hit');
  B.recordResult(ai, 0, 1, 'sunk', { id: 'destroyer', length: 2 });
  assert.equal(ai.openHits.length, 0);
  assert.deepEqual(ai.remaining, [5, 4, 3, 3]);
  B.chooseShot(ai);
  assert.equal(ai.mode, 'hunt');
});

test('AI never fires at the same square twice, even on an empty board', () => {
  const ai = B.createAI(seeded(1));
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const shot = B.chooseShot(ai);
    const key = shot.row * 10 + shot.col;
    assert.ok(!seen.has(key), 'repeat shot at ' + B.coordLabel(shot.row, shot.col));
    seen.add(key);
    B.recordResult(ai, shot.row, shot.col, 'miss');
  }
  assert.equal(B.chooseShot(ai), null);
});

test('AI only sees shot results, not the hidden board', () => {
  const game = readyGame(21);
  B.playerFire(game, 0, 0);
  B.aiFire(game);
  const brainKeys = Object.keys(game.brain).sort();
  assert.deepEqual(brainKeys, ['knowledge', 'mode', 'openHits', 'parity', 'remaining', 'rng', 'turn']);
  assert.ok(!JSON.stringify(game.brain.knowledge).includes('carrier'));
});

test('simulated full games: the AI always finishes without repeating a shot', () => {
  const GAMES = 2000;
  let totalShots = 0;
  let worst = 0;
  for (let seed = 1; seed <= GAMES; seed++) {
    const rng = seeded(seed);
    const board = B.placeShipsRandomly(B.createBoard(), rng);
    const ai = B.createAI(rng);
    const fired = new Set();
    let shots = 0;
    let over = false;
    while (!over) {
      const shot = B.chooseShot(ai);
      assert.ok(shot, `seed ${seed}: AI ran out of moves before winning`);
      const key = shot.row * 10 + shot.col;
      assert.ok(!fired.has(key), `seed ${seed}: repeat shot at ${B.coordLabel(shot.row, shot.col)}`);
      fired.add(key);
      const res = B.receiveShot(board, shot.row, shot.col);
      assert.equal(res.valid, true);
      B.recordResult(ai, res.row, res.col, res.result, res.ship);
      shots++;
      over = res.gameOver;
      assert.ok(shots <= 100, `seed ${seed}: more than 100 shots`);
    }
    assert.equal(B.allSunk(board), true);
    totalShots += shots;
    worst = Math.max(worst, shots);
  }
  const average = totalShots / GAMES;
  // Random firing averages ~96 shots; hunt/target should be far better.
  assert.ok(average < 70, `average ${average.toFixed(1)} shots is too high`);
  console.log(`# AI average: ${average.toFixed(1)} shots, worst: ${worst} over ${GAMES} games`);
});

test('simulated full games through the game API always end with a winner', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const game = readyGame(seed);
    const rng = seeded(seed + 5000);
    let turns = 0;
    while (game.phase === 'battle') {
      if (game.turn === 'player') {
        let res;
        do {
          res = B.playerFire(game, Math.floor(rng() * 10), Math.floor(rng() * 10));
        } while (!res.valid);
      } else {
        assert.equal(B.aiFire(game).valid, true);
      }
      turns++;
      assert.ok(turns <= 200);
    }
    assert.ok(game.winner === 'player' || game.winner === 'ai');
  }
});

test('setup tap on another ship while one is selected is a no-fit, not a pick-up', () => {
  const board = B.createBoard();
  B.placeShip(board, 'carrier', 0, 0, B.HORIZONTAL);
  const before = JSON.stringify(board);
  const res = B.setupTap(board, 'battleship', 0, 2, B.HORIZONTAL);
  assert.deepEqual(res, { action: 'no-fit', id: 'battleship' });
  assert.equal(JSON.stringify(board), before, 'carrier stays put and nothing else changes');
  assert.equal(B.getShip(board, 'battleship'), null);
});

test('setup tap picks up a placed ship only when no ship is selected', () => {
  const board = B.createBoard();
  B.placeShip(board, 'carrier', 2, 3, B.VERTICAL);
  assert.deepEqual(B.setupTap(board, null, 4, 3, B.HORIZONTAL),
    { action: 'picked-up', id: 'carrier', orientation: B.VERTICAL });
  assert.equal(B.getShip(board, 'carrier'), null);
  assert.ok(board.occupancy.every((row) => row.every((v) => v === null)));
  assert.deepEqual(B.setupTap(board, null, 4, 3, B.HORIZONTAL), { action: 'none' });
});

test('setup tap places or moves the selected ship when it fits', () => {
  const board = B.createBoard();
  assert.deepEqual(B.setupTap(board, 'carrier', 0, 0, B.HORIZONTAL), { action: 'placed', id: 'carrier' });
  assert.deepEqual(B.setupTap(board, 'carrier', 0, 2, B.HORIZONTAL), { action: 'placed', id: 'carrier' });
  assert.equal(B.getShip(board, 'carrier').col, 2);
  assert.deepEqual(B.setupTap(board, 'destroyer', 0, 9, B.HORIZONTAL), { action: 'no-fit', id: 'destroyer' });
  assert.deepEqual(B.setupTap(board, 'carrier', 10, 0, B.HORIZONTAL), { action: 'none' });
});
