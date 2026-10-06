# Battleship vs AI

Single-player Battleship that runs in the browser. You play against a computer opponent that uses a hunt-and-target strategy.

**Play it:** https://margaretyan24-ux.github.io/battleship-vs-ai/

Plain HTML, CSS and JavaScript — no frameworks, no build step.

## How to play

1. **Place your fleet.** Pick a ship from the list, then click a square on *Your fleet* to place it. The square you click is the ship's top (vertical) or left (horizontal) end.
   - A green preview means the ship fits; red means it would overlap another ship or go off the board.
   - Rotate with the **Rotate** button or the **R** key.
   - Click a ship you've already placed to pick it up and move it.
   - **Place randomly** fills the board for you; **Clear** removes all your ships.
   - **Start battle** is enabled once all five ships are placed.
2. **Fire.** Click a square on *Enemy waters*. You get one shot per turn, then the computer fires back after a short pause. Firing at a square you've already tried doesn't cost you a turn.
3. **Win** by sinking all five enemy ships before the computer sinks yours. Press **Play again** to start a fresh game.

| Mark | Meaning |
| --- | --- |
| Grey square | Your ship |
| Dot (•) | Miss |
| Red ✕ | Hit |
| Dark red ✕ with outline | Sunk ship |

The fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2). Ships can be horizontal or vertical, may touch, but can't overlap or go off the 10×10 board.

### Keyboard

- **Tab** moves between controls and into each board; **arrow keys** (plus **Home**/**End**) move around a board.
- **Enter** or **Space** places a ship / fires at the focused square.
- **R** rotates the ship during setup. Arrow keys also switch between ships in the ship list.
- The status line and battle log are announced to screen readers.

## How the AI works

The AI only uses information a human player would have: where it has fired, whether each shot was a hit or a miss, and which ship type sank. It never looks at your board.

- **Hunt mode:** with no unresolved hits, it fires at random squares on a checkerboard pattern (every ship is at least 2 long, so every ship covers at least one square of each colour). It skips squares where no remaining ship could fit.
- **Target mode:** after a hit, it fires at the neighbouring squares. Once it has two hits in a row it follows that line in both directions until it hits water.
- **Sinking:** when a ship sinks, the AI uses the ship's length to work out which hits belonged to it. Any leftover hits (from an adjacent ship) keep it in target mode; otherwise it goes back to hunting.
- It only ever picks squares it hasn't fired at, so it never repeats a shot.

Over 2,000 simulated games it needs about 50 shots on average to sink the whole fleet (random firing needs ~96).

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `style.css` | Styles (side-by-side boards on desktop, stacked on mobile) |
| `game.js` | All game rules and AI logic. No browser code — works in Node and the browser |
| `ui.js` | Browser interface: rendering, input, turn timing |
| `test/game.test.js` | Unit tests for `game.js` |

## Running locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Running the tests

Requires Node.js 18 or newer. There are no dependencies to install.

```sh
npm test
# or
node --test
```

The tests use Node's built-in test runner and cover ship placement, overlap and edge rules, repeat shots, sinking, game over, turn order, AI targeting behaviour, the AI never repeating a shot, and a simulation of thousands of full AI games to confirm it always finishes.

## Deployment

The site is served by GitHub Pages straight from the `main` branch root — push to `main` and the live site updates.

## License

MIT
