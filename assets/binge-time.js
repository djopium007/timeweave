/* ReelOrder binge time.
   One place the watch-order page, the timeline page and the SEO build all use.
   Totals come only from assets/runtimes.json. Nothing here invents a runtime.
   Loaded as a classic script (window.reelOrderBinge). scripts/build-seo.mjs evals it too. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.reelOrderBinge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function uniqueItems(watchOrder) {
    var seen = new Map();
    var kindDefault = (watchOrder && watchOrder.kindDefault) || 'film';
    var orders = (watchOrder && watchOrder.orders) || {};
    Object.keys(orders).forEach(function (key) {
      var order = orders[key];
      var groups = order.groups || [{ items: order.items }];
      groups.forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (!seen.has(it.id)) {
            seen.set(it.id, { id: it.id, title: it.title, year: it.year, kind: it.kind || kindDefault });
          }
        });
      });
    });
    return Array.from(seen.values());
  }

  /* Under 3 hours, hours and minutes still read naturally.
     At 3 hours and above, the nearest hour. Always "about": a theatrical
     listing is already rounded to the minute, and cuts differ by market. */
  function formatAbout(totalMinutes) {
    if (totalMinutes < 180) {
      var h = Math.floor(totalMinutes / 60);
      var m = totalMinutes % 60;
      var hours = h === 1 ? '1 hour' : h + ' hours';
      var mins = m === 1 ? '1 minute' : m + ' minutes';
      if (h === 0) return 'about ' + mins;
      if (m === 0) return 'about ' + hours;
      return 'about ' + hours + ' ' + mins;
    }
    return 'about ' + Math.round(totalMinutes / 60) + ' hours';
  }

  function basis(totalMinutes, checked) {
    var when = 'Checked ' + checked + '.';
    if (totalMinutes < 180) return 'Theatrical runtimes added together. ' + when;
    return 'Theatrical runtimes added together, then rounded to the nearest hour. ' + when;
  }

  function filmName(title) {
    return String(title || '').replace(/^The /, '');
  }

  function watchLine(title, included, filmTotal, totalMinutes) {
    var dur = formatAbout(totalMinutes);
    var name = filmName(title);
    if (included === filmTotal) {
      if (filmTotal === 1) return 'Watch ' + title + ' in ' + dur + '.';
      if (filmTotal === 2) return 'Watch both ' + name + ' films in ' + dur + '.';
      return 'Watch all ' + filmTotal + ' ' + name + ' films in ' + dur + '.';
    }
    return dur.charAt(0).toUpperCase() + dur.slice(1) + ' across ' + included + ' of the ' + filmTotal + ' ' + name + ' films.';
  }

  function exclusionNote(excluded) {
    var books = excluded.filter(function (i) { return i.kind === 'book'; });
    var games = excluded.filter(function (i) { return i.kind === 'game'; });
    var tvs = excluded.filter(function (i) { return i.kind === 'tv'; });
    var special = excluded.filter(function (i) { return i.kind === 'film' && i.reason; });
    var missing = excluded.filter(function (i) { return i.kind === 'film' && !i.reason; });
    var parts = [];
    if (books.length === 1) parts.push(books[0].title + ' is a novel, so it has no runtime');
    else if (books.length) parts.push('The ' + books.length + ' novels are not included, because novels have no runtime');
    if (games.length === 1) parts.push(games[0].title + ' is a game, so it has no single runtime');
    else if (games.length) parts.push(games.map(function (g) { return g.title; }).join(' and ') + ' are games, so they have no single runtime');
    if (tvs.length === 1) parts.push(tvs[0].title + ' is not included, because its episode runtimes are not verified');
    else if (tvs.length) parts.push(tvs.length + ' series are not included, because their episode runtimes are not verified');
    special.forEach(function (s) { parts.push(s.reason); });
    missing.forEach(function (m) { parts.push(m.title + ' is not included, because its runtime is not verified'); });
    if (!parts.length) return '';
    return parts.join('. ') + '.';
  }

  function summarize(opts) {
    var empty = { hasBinge: false, hasBingeNote: false, line: '', note: '', basis: '', totalMinutes: 0, included: 0, filmTotal: 0 };
    opts = opts || {};
    var runtimes = opts.runtimes;
    if (!runtimes || !runtimes.titles) return empty;
    if (opts.hasWatchOrder && !opts.watchOrder) return empty;

    var id = opts.id;
    var items;
    if (opts.watchOrder) items = uniqueItems(opts.watchOrder);
    else {
      var bare = runtimes.titles[id] || {};
      items = Object.keys(bare).map(function (itemId) {
        var rec = bare[itemId];
        return { id: itemId, title: rec.title, year: rec.year, kind: 'film' };
      });
    }
    if (!items.length) return empty;

    var known = runtimes.titles[id] || {};
    var unver = (runtimes.unverified && runtimes.unverified[id]) || {};
    var included = [];
    var excluded = [];
    items.forEach(function (it) {
      var rec = known[it.id];
      var un = unver[it.id];
      if (un) {
        excluded.push({ id: it.id, title: un.title || it.title, kind: un.kind || it.kind, reason: un.reason || '' });
        return;
      }
      if ((it.kind === 'film' || it.kind === 'tv') && rec && Number.isInteger(rec.minutes) && rec.minutes > 0) {
        included.push({ id: it.id, title: it.title, kind: it.kind, minutes: rec.minutes });
        return;
      }
      excluded.push(it);
    });

    var includedFilms = included.filter(function (i) { return i.kind === 'film'; });
    if (!includedFilms.length) return empty;
    var total = includedFilms.reduce(function (sum, i) { return sum + i.minutes; }, 0);
    var filmTotal = items.filter(function (i) { return i.kind === 'film'; }).length;
    var note = exclusionNote(excluded);
    return {
      hasBinge: true,
      hasBingeNote: !!note,
      line: watchLine(opts.title, includedFilms.length, filmTotal, total),
      note: note,
      basis: basis(total, runtimes.checked || '8 Nov 2026'),
      totalMinutes: total,
      included: includedFilms.length,
      filmTotal: filmTotal,
    };
  }

  return { summarize: summarize, formatAbout: formatAbout };
});
