# Bug log

Real bugs found and fixed while building and testing Battleship vs AI.

| # | Bug | How it was found | Fix | Verified by |
|---|-----|------------------|-----|-------------|
| 1 | The boards had the wrong screen-reader role: they were marked as a `grid`, which needs row elements the page didn't have, so screen readers could misread them. | Reviewing the page markup before testing. | Changed both boards to `role="group"`. Each square is still a button with a label like "B5, hit". | Markup review and browser testing of the labels. Not tested with a real screen reader. |
| 2 | Boards were cut off on phones: at 390px wide, column J ran into the edge of the panel. | Full-page screenshot at phone size. | Smaller squares on narrow screens, plus tighter padding and gaps under 480px. | Screenshots at 390px and 360px with no sideways scrolling; iPhone check in Safari. |
| 3 | On phones the status line scrolled out of view, so you couldn't see whose turn it was while looking at the enemy board. | Screenshot after scrolling down at phone size. | The status line now stays pinned to the top of the screen, with a slightly smaller font on narrow screens. | Scrolled screenshot at phone size; iPhone check in Safari. |
| 4 | When placing a ship, the square under the pointer showed the hover blue instead of the green or red preview colour. | Setup screenshot at phone size. | Added hover rules that keep the preview colour. | Setup screenshots showing all squares green when the ship fits and red when it doesn't. |
| 5 | `npm test` crashed with "Cannot find module" instead of running the tests, because Node 24 treated `node --test test/` as a file to load. | Running `npm test` for the first time. | Changed the script to `node --test`, which finds `test/*.test.js` automatically. | `npm test` runs every test (27 passing now). |
| 6 | The live site logged a 404 error on every load because the browser asked for a tab icon (`/favicon.ico`) that didn't exist. | Console error during browser testing of the live site, then confirmed in a clean browser profile. | Added a tab icon (`favicon.svg`, `favicon-32.png`) and an iPhone home-screen icon (`apple-touch-icon.png`), linked from `index.html`. | All icon files load on the live site, and fresh loads plus a full live game show no 404s or console errors. |
| 7 | During setup, tapping a placed ship while another ship was selected picked up the placed ship instead of saying the new one doesn't fit (for example, tapping the Carrier with the Battleship selected). | Margaret's testing on an iPhone in Safari. | With a ship selected, a tap now only places that ship or says it doesn't fit; picking up a placed ship only happens when no ship is selected. The setup hint now explains how to move a ship. | 3 new unit tests, including the exact steps; same steps on the live site before and after the fix (phone-sized browser, touch taps); iPhone check in Safari. |

## Final test results

- **Unit tests:** `npm test` has 27 passing, 0 failing. They cover ship placement, overlap and edge rules, repeat shots, sinking, game over, turn order, setup taps, the AI never repeating a shot, and 2,000 simulated full AI games. Every game finished, averaging about 50 shots with a worst case of 66.
- **Full win on the live site:** Devin played a complete game in Chrome after the tab icon fix. Random numbers were fixed to a known seed in the test browser only, so the enemy ships were in known squares and the shipped code was unchanged. All 35 checks passed:
  - The win message said "You win!" and "You sank all five enemy ships in 20 shots". That's correct: 17 hits and 3 misses, with a deliberate repeat shot not counted.
  - All five enemy ships showed as sunk, and the battle log recorded each sinking.
  - The enemy board stayed locked after the win.
  - "Play again" fully reset the boards, battle log, lost ships, ship picker, rotation, and the Start battle button.
  - The next game had a new enemy fleet.
  - There were no console errors or failed requests.
- **iPhone check:** Margaret tested on an iPhone in Safari and found bug #7. After the fix, she retested on her iPhone and confirmed the placement fix, firing, repeat shots, the turn status staying visible, and Play again all worked.
- **Not tested:** a real screen reader.
