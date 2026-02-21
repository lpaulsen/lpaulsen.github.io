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

  function buildCardImages(cards) {
    var html = '<div class="eq-next-deck-images">';
    for (var i = 0; i < cards.length; i++) {
      var name = cards[i];
      var src = window.NashmeScryfall ? NashmeScryfall.getImageUrl(name) : '';
      html +=
        '<img src="' + src + '"' +
        ' alt="' + name.replace(/"/g, '&quot;') + '"' +
        ' loading="lazy"' +
        ' onerror="this.outerHTML=\'<span class=\\\'eq-img-fallback\\\'>' +
          name.replace(/'/g, '&#39;').replace(/"/g, '&quot;') +
        '</span>\'">';
    }
    html += '</div>';
    return html;
  }

  function buildWtlControls(playId, drawId, currentResult, label) {
    var results = ['W', 'T', 'L'];
    var html = '<div class="eq-direction-row">';
    html += '<span class="eq-direction-label">' + label + ':</span> ';
    if (currentResult !== null) {
      // Already evaluated — show read-only badge
      html += '<span class="eq-result-badge eq-result-' + currentResult + '">' + currentResult + '</span>';
    } else {
      // Unevaluated — show W/T/L buttons
      html += '<span class="eq-wtl-group" data-play-id="' + playId + '" data-draw-id="' + drawId + '">';
      for (var i = 0; i < results.length; i++) {
        html += '<button type="button" class="eq-wtl-btn eq-wtl-' + results[i] + '" data-result="' + results[i] + '">' + results[i] + '</button>';
      }
      html += '</span>';
    }
    html += '</div>';
    return html;
  }

  function attachWtlListeners(container) {
    var groups = container.querySelectorAll('.eq-wtl-group');
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var buttons = group.querySelectorAll('.eq-wtl-btn');
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', handleWtlClick);
      }
    }
  }

  function handleWtlClick(e) {
    var btn = e.currentTarget;
    var group = btn.parentElement;
    var playId = group.dataset.playId;
    var drawId = group.dataset.drawId;
    var result = btn.dataset.result;
    var data = window.NashmeData;
    if (!data) return;

    // Check if this button is already active (toggle off)
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      data.setMatchup(playId, drawId, null);
    } else {
      // Deactivate siblings, activate this one
      var siblings = group.querySelectorAll('.eq-wtl-btn');
      for (var i = 0; i < siblings.length; i++) {
        siblings[i].classList.remove('active');
      }
      btn.classList.add('active');
      data.setMatchup(playId, drawId, result);
    }

    // Update Submit button disabled state
    updateSubmitBtnState();
  }

  function updateSubmitBtnState() {
    var submitBtn = document.getElementById('eq-submit-next');
    if (!submitBtn) return;
    // Enable if any wtl group has an active button
    var groups = document.querySelectorAll('.eq-wtl-group');
    var anySet = false;
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].querySelector('.eq-wtl-btn.active')) {
        anySet = true;
        break;
      }
    }
    submitBtn.disabled = !anySet;
  }

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

    // Check directions
    var keyAB = nextPair.deckA + ':' + nextPair.deckB;
    var resultAB = matchups.hasOwnProperty(keyAB) ? matchups[keyAB] : null;
    var keyBA = nextPair.deckB + ':' + nextPair.deckA;
    var resultBA = matchups.hasOwnProperty(keyBA) ? matchups[keyBA] : null;

    var isMirror = nextPair.deckA === nextPair.deckB;

    // Build direction controls
    var directionsHtml = '<div class="eq-next-directions">';
    if (isMirror) {
      directionsHtml += buildWtlControls(nextPair.deckA, nextPair.deckB, resultAB, 'Mirror');
    } else {
      directionsHtml += buildWtlControls(nextPair.deckA, nextPair.deckB, resultAB, nameA + ' on play');
      directionsHtml += buildWtlControls(nextPair.deckB, nextPair.deckA, resultBA, nameB + ' on play');
    }
    directionsHtml += '</div>';

    // Build image layout
    var imagesHtml;
    if (isMirror) {
      imagesHtml =
        '<div class="eq-next-decks">' +
          '<div class="eq-next-deck-group">' +
            buildCardImages(deckA.cards) +
            '<div class="eq-next-deck-name">Mirror match</div>' +
          '</div>' +
        '</div>';
    } else {
      imagesHtml =
        '<div class="eq-next-decks">' +
          '<div class="eq-next-deck-group">' +
            buildCardImages(deckA.cards) +
            '<div class="eq-next-deck-name">' + nameA + '</div>' +
          '</div>' +
          '<span class="eq-next-vs">vs</span>' +
          '<div class="eq-next-deck-group">' +
            buildCardImages(deckB.cards) +
            '<div class="eq-next-deck-name">' + nameB + '</div>' +
          '</div>' +
        '</div>';
    }

    // Determine if any directions are unevaluated (for submit button state)
    var hasUnevaluated = isMirror ? (resultAB === null) : (resultAB === null || resultBA === null);

    container.innerHTML =
      '<div class="eq-next-card">' +
        imagesHtml +
        directionsHtml +
        (hasUnevaluated
          ? '<button type="button" id="eq-submit-next" class="eq-submit-btn" disabled>Submit &amp; Next</button>'
          : '') +
      '</div>';

    // Attach event listeners
    attachWtlListeners(container);

    var submitBtn = document.getElementById('eq-submit-next');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        refresh();
      });
    }
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

