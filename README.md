# Mia Pretorius

Personal site. Static HTML, CSS and JS with no build step: open `index.html` or serve the folder.

    python3 -m http.server 8000     # then visit http://localhost:8000

## Pages

- `/` (`index.html`, `landing.css`, `landing.js`) - the name buried under a pile of pills.
  Move the pointer (or drag a finger) to shove them aside and uncover the name and the two links.
- `/rxcross/` - RxCross, the daily brand-name drug crossword. See `rxcross/README.md`.
- `/pharmacy/` - Night Shift, a top-down pixel-art pharmacy game.

## Night Shift

Mia runs a late-night apothecary. The camera stays locked on her while she walks the back of the shop.

- Customers queue at the Rx drop-off. Walk up and press E for a first-person view of the counter:
  move the mouse to look around, click the ID, the prescription, the computer (patient file and stock)
  or the phone (calls the prescriber). Then fill it or refuse it.
- Accepted scripts get compounded at the bench: watch the recipe of occult ingredients, repeat it,
  then stop the grinding needle in the green. Hand the bag over at the pick-up bell.
- Ingredients and pharmacy techs are bought at the back-office terminal. Techs compound on their own.
- Each night is a level with an earnings goal. New paperwork tricks unlock as the nights go on
  (expired IDs, wrong patient, unsigned and forged scripts, mismatched photos, allergies).
  Three strikes closes the counter for the night.

Code lives in `pharmacy/js/`: `data.js` (map, ingredients, remedies, levels), `art.js` (all pixel art is
drawn procedurally, there are no image files) and `game.js` (everything else). Progress is saved to
`localStorage` at the end of each night.
