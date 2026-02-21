/**
 * NashMe Equilibrium UI
 * Orchestrates the solver: win-points config, "next matchup" recommendation,
 * and equilibrium-sorted matrix rendering.
 * Depends on: window.NashmeData, window.NashmeSolver, window.NashmeMatrixUI.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'nashme_win_points';
  var DEFAULT_WIN_POINTS = 3;

  // --- Win Points ---

  function getWinPoints() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '2') return 2;
    return DEFAULT_WIN_POINTS;
  }

  function setWinPoints(val) {
    localStorage.setItem(STORAGE_KEY, String(val));
  }

  // --- Config UI ---

  function renderConfig() {
    var container = document.getElementById('equilibrium-config');
    if (!container) return;

    container.innerHTML =
      '<label class="eq-config-label">Win points: ' +
        '<select id="eq-win-points" class="eq-win-select">' +
          '<option value="2"' + (getWinPoints() === 2 ? ' selected' : '') + '>2 pts</option>' +
          '<option value="3"' + (getWinPoints() === 3 ? ' selected' : '') + '>3 pts</option>' +
        '</select>' +
      '</label>';

    document.getElementById('eq-win-points').addEventListener('change', function () {
      setWinPoints(parseInt(this.value, 10));
      refresh();
    });
  }

  // --- Deck name helper ---

  function deckName(deck) {
    if (!deck || !deck.cards) return '?';
    return deck.cards.join(' / ');
  }

  function findDeckById(decks, id) {
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === id) return decks[i];
    }
    return null;
  }

  // --- Next Matchup UI ---

  function renderNextMatchup(nextPair, decks, matchups) {
    var container = document.getElementById('next-matchup');
    if (!container) return;

    if (decks.length < 2) {
      container.innerHTML = '<p class="eq-next-msg">Add at least 2 decks to see recommendations.</p>';
      return;
    }

    if (!nextPair) {
      container.innerHTML = '<p class="eq-next-msg eq-next-done">All matchups evaluated ✓</p>';
      return;
    }

    var deckA = findDeckById(decks, nextPair.deckA);
    var deckB = findDeckById(decks, nextPair.deckB);
    var nameA = deckName(deckA);
    var nameB = deckName(deckB);

    // Build direction statuses
    var directions = [];
    // Check A on play vs B on draw
    var keyAB = nextPair.deckA + ':' + nextPair.deckB;
    var resultAB = matchups.hasOwnProperty(keyAB) ? matchups[keyAB] : null;
    // Check B on play vs A on draw
    var keyBA = nextPair.deckB + ':' + nextPair.deckA;
    var resultBA = matchups.hasOwnProperty(keyBA) ? matchups[keyBA] : null;

    // For mirror matches, only one direction
    if (nextPair.deckA === nextPair.deckB) {
      var mirrorStatus = resultAB !== null ? '✓ ' + resultAB : '<span class="eq-needs-eval">needs eval</span>';
      directions.push('Mirror: ' + mirrorStatus);
    } else {
      var playStatus = resultAB !== null ? '✓ ' + resultAB : '<span class="eq-needs-eval">needs eval</span>';
      var drawStatus = resultBA !== null ? '✓ ' + resultBA : '<span class="eq-needs-eval">needs eval</span>';
      directions.push('Play: ' + playStatus);
      directions.push('Draw: ' + drawStatus);
    }

    container.innerHTML =
      '<div class="eq-next-card">' +
        '<strong>' + nameA + '</strong> vs <strong>' + nameB + '</strong>' +
        ' — ' + directions.join(' · ') +
      '</div>';
  }

  // --- Main Refresh ---

  function refresh() {
    var data = window.NashmeData;
    var solver = window.NashmeSolver;
    if (!data || !solver) return;

    var decks = data.getDecks();
    var matchups = data.getAllMatchups();
    var winPoints = getWinPoints();

    var result = solver.compute(decks, matchups, winPoints);
    var weights = result.weights;

    // Sort decks by weight descending
    var sortedDecks = decks.slice().sort(function (a, b) {
      return (weights[b.id] || 0) - (weights[a.id] || 0);
    });

    // Render matrix with sorted order and weights
    if (window.NashmeMatrixUI) {
      NashmeMatrixUI.render(sortedDecks, weights);
    }

    // Render next matchup recommendation
    renderNextMatchup(result.nextPair, decks, matchups);
  }

  // --- Bootstrap ---

  function init() {
    renderConfig();
    refresh();
  }

  // --- Export ---
  window.NashmeEquilibriumUI = { refresh: refresh };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

