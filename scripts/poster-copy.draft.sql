-- Draft poster taglines + descriptions for Opi's review.
-- Nothing here is live: run this file against the reelorder project to publish it.
--   tagline     -> the line under the poster title on /posters/<id>
--   description -> the page's meta description and its share-card text
-- Deliberately says nothing about licensing or studio endorsement.
-- Revert with:  update posters set tagline = null, description = null;

update posters set
  tagline = 'Every ship, every drop, every xenomorph — one wall.',
  description = 'The full Alien run as a single collection print: the Nostromo, Hadley''s Hope, Fury 161 and beyond, laid out in release order.'
where id = 'aliens';

update posters set
  tagline = 'Three films, four versions of 1985.',
  description = 'The whole trilogy on one sheet — 1955, 2015, Hell Valley and 1885, with the DeLorean threading all of it together.'
where id = 'back-to-the-future';

update posters set
  tagline = 'Yippee-ki-yay, framed.',
  description = 'Five films of John McClane in the wrong building at the wrong time, collected into one print.'
where id = 'die-hard';

update posters set
  tagline = 'Ten films. One very large family.',
  description = 'The full run from a Los Angeles street race to whatever it is they are doing now, in one collection print.'
where id = 'fast-furious';

update posters set
  tagline = 'Fortune and glory, wall-sized.',
  description = 'Every Indiana Jones adventure in one print — the ark, the stones, the grail and the rest.'
where id = 'indiana-jones';

update posters set
  tagline = 'They shouldn''t have killed the dog.',
  description = 'The complete John Wick run collected into one print, from the first night at the Continental onward.'
where id = 'john-wick';

update posters set
  tagline = 'Too old for this. Four films running.',
  description = 'Riggs and Murtaugh across the full Lethal Weapon run, collected into a single collection print.'
where id = 'lethal-weapon';

update posters set
  tagline = 'Your mission, should you choose to hang it.',
  description = 'Every Mission: Impossible film in one collection print — masks, ledges, and one man refusing a stunt double.'
where id = 'mission-impossible';

update posters set
  tagline = 'The academy that never should have graduated anyone.',
  description = 'The complete Police Academy run collected into one print, in all its 1980s glory.'
where id = 'police-academy';

update posters set
  tagline = 'They drew first blood, across four decades.',
  description = 'The full Rambo run in one collection print, from a small town in Washington to the last stand.'
where id = 'rambo';

update posters set
  tagline = 'Pain don''t hurt.',
  description = 'The Double Deuce, the philosophy, the throat — Road House collected as a single print.'
where id = 'road-house';

update posters set
  tagline = 'Six films, four futures, one war.',
  description = 'The complete Terminator run in one collection print — every attempt to stop Judgment Day, in release order.'
where id = 'terminator';

update posters set
  tagline = 'There is no spoon. There is a poster.',
  description = 'The full Matrix run collected into one print, from the first red pill to Resurrections.'
where id = 'the-matrix';
