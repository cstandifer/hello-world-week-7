# Sunset Games '28

A one-button track & field meet set at a sunset stadium in Los Angeles, 2028. Built with p5.js.

**Open `index.html` in a browser and use the SPACE bar. That's the only control.**

## The game I started from

**Track & Field** (Konami, 1983). The arcade version used three buttons: two RUN buttons that you pressed one after the other, and an ACTION button. It had six events, and I kept five of them and dropped the high jump.

## What I automated

| Event | Original controls | One-button version |
|---|---|---|
| 100m Dash | alternate two RUN buttons | **mash** SPACE. Each press adds speed, and you slow down when you stop |
| Long Jump | RUN + RUN, hold to set the angle | **mash** to sprint down a single runway. Start **holding** inside the yellow zone before the board, and the athlete plants and freezes there. While you hold, the angle meter swings up and down, and you **release** while it's in the green band (near 45°) to jump. A press longer than a mash counts as the hold |
| Javelin | RUN + RUN, timed ACTION press for the angle | the **run-up is automated**. **Tap 1** locks a swinging power meter. **Tap 2** throws at a swinging angle needle. Throw before the foul line |
| 110m Hurdles | RUN + RUN, ACTION to jump | **hold** to run, **release** to jump, then press again to keep running. You hold instead of mashing, so releasing can't be confused with running |
| Hammer Throw | a RUN press to start spinning, timed ACTION press for the angle | the **spinning is automated** and gets faster every turn. **Tap once** while the hammer is in the yellow zone. Waiting longer gives more speed but a harder timing window, and after 7 turns you fall |

The menu works with the same button: **tap** to move to the next item and **hold** to choose it (a bar fills while you hold).

## How to play

1. Press SPACE on the title screen.
2. Pick **THE GAMES** to play all 5 events in a row, or pick one event to practice.
3. You compete against **three CPU rivals**: R.SATO (JPN), M.DIALLO (SEN) and L.BRANDT (GER). Their form is rolled fresh for every event, so a different rival might lead each time. In the races they run in the lanes next to you. In the jumps and throws they take 3 attempts too. Each round they get a bit better or worse, and sometimes they foul. Their best marks so far show as colored flags on the field.
4. **Field events** (long jump, javelin, hammer) always give you **3 attempts**, and your **best one counts**, so each attempt is a chance to beat yourself. Your best so far shows as a pink line or flag on the field and as `BEST` in the HUD.
   **Races** (100m, hurdles) are one race. A false start uses up one of your 3 starts and you line up again. The first race you actually run is the one that counts.
   * After each round a **scoreboard** shows what everyone did that round (green = a new best, X = a foul) and ranks everyone's best mark. When the event ends, your place wins an event medal (1st gold, 2nd silver, 3rd bronze).
   * Foul all 3 attempts, or false start 3 times, and you score **0 points** for that event. The Games carry on to the next event either way.
5. **Scoring works like the decathlon.** Your best mark in each event is turned into points with the official combined-events formula, so a world-class mark is worth about 1000 points:
   * races: `points = A × (B − time)^C`
   * jumps and throws: `points = A × (distance − B)^C` (long jump in centimeters)
   * 100m, long jump, javelin and 110m hurdles use the real decathlon constants. Hammer isn't a decathlon event, so it uses made-up constants in the same style.
   * The rivals are scored with the same tables.
6. After all 5 events, the **final standings** rank everyone by total points. **Finish in the top 3 and you win** a gold, silver or bronze at the Closing Ceremony. **Finish 4th and it's game over.** Your total is saved as the high score.
7. Press SPACE on the end screen to play again.

Fouls give you no mark for that attempt. They are: taking off past the long jump board, crossing the javelin line, and throwing the hammer outside the zone. In races, pressing before "GO!" is a **false start**.

## States

`title → menu → intro → play → result → (next attempt or next event) → over → title`

## Files

* `index.html` loads p5.js and the Press Start 2P pixel font
* `sketch.js` holds the whole game: state machine, one class per event, pixel-art sprites, and sound effects made with Web Audio
