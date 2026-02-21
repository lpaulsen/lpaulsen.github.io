/**
 * NashMe Matchup Matrix UI
 * Renders an interactive matchup grid. Rows = play deck, columns = draw deck.
 * Depends on window.NashmeData being loaded first.
 * Injects its own styles to avoid conflicts with other CSS files.
 */
(function () {
  'use strict';

  var MAX_DECKS = 50;
  var CYCLE = [null, 'W', 'T', 'L'];

  // --- Inject styles ---
  function injectStyles() {
    if (document.getElementById('nashme-matrix-styles')) return;
    var style = document.createElement('style');
    style.id = 'nashme-matrix-styles';
    style.textContent = [
      '.nashme-matrix-wrap { overflow: auto; max-width: 100%; margin: 1.5rem 0; }',
      '.nashme-matrix-warning { background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }',
      '.nashme-matrix-empty { color: #888; font-style: italic; padding: 1rem 0; }',
      'table.nashme-matrix { border-collapse: collapse; min-width: max-content; }',
      'table.nashme-matrix th, table.nashme-matrix td { border: 1px solid #ccc; text-align: center; min-width: 48px; height: 40px; font-size: 0.85rem; padding: 4px 6px; }',
      'table.nashme-matrix thead th { background: #e9ecef; position: sticky; top: 0; z-index: 2; }',
      'table.nashme-matrix thead th.nashme-corner { z-index: 3; }',
      'table.nashme-matrix tbody th { background: #e9ecef; position: sticky; left: 0; z-index: 1; text-align: right; white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }',
      'table.nashme-matrix .nashme-axis-label { font-weight: 600; font-size: 0.75rem; color: #555; }',
      'table.nashme-matrix td.nashme-cell { cursor: pointer; font-weight: 700; font-size: 1rem; transition: background 0.15s; user-select: none; }',
      'table.nashme-matrix td.nashme-cell:hover { filter: brightness(0.92); }',
      'table.nashme-matrix td.nashme-cell-W { background: #d4edda; color: #155724; }',
      'table.nashme-matrix td.nashme-cell-T { background: #fff3cd; color: #856404; }',
      'table.nashme-matrix td.nashme-cell-L { background: #f8d7da; color: #721c24; }',
      'table.nashme-matrix td.nashme-cell-null { background: #f8f9fa; color: #aaa; }',
      'table.nashme-matrix td.nashme-diagonal { background: #dee2e6; cursor: default; }',
      'table.nashme-matrix td.nashme-diagonal:hover { filter: none; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // --- Helpers ---

  function deckLabel(deck) {
    if (!deck || !deck.cards) return deck ? deck.id : '?';
    return deck.cards.join(' / ');
  }

  function nextResult(current) {
    var idx = CYCLE.indexOf(current);
    return CYCLE[(idx + 1) % CYCLE.length];
  }

  // --- Render ---

  function getContainer() {
    var el = document.getElementById('matchup-matrix');
    if (!el) {
      el = document.createElement('section');
      el.id = 'matchup-matrix';
      var main = document.querySelector('main');
      if (main) {
        main.appendChild(el);
      } else {
        document.body.appendChild(el);
      }
    }
    return el;
  }

  function render() {
    injectStyles();
    var container = getContainer();
    container.innerHTML = '';

    var data = window.NashmeData;
    if (!data) {
      container.innerHTML = '<p class="nashme-matrix-empty">Data layer not loaded.</p>';
      return;
    }

    var allDecks = data.getDecks();
    if (allDecks.length === 0) {
      container.innerHTML = '<p class="nashme-matrix-empty">No decks yet. Add some decks to see the matchup matrix.</p>';
      return;
    }

    var capped = false;
    var decks = allDecks;
    if (allDecks.length > MAX_DECKS) {
      capped = true;
      decks = allDecks.slice(0, MAX_DECKS);
    }

    // Warning
    if (capped) {
      var warn = document.createElement('div');
      warn.className = 'nashme-matrix-warning';
      warn.textContent = 'Showing first ' + MAX_DECKS + ' of ' + allDecks.length + ' decks. Remove some decks to see all matchups.';
      container.appendChild(warn);
    }

    // Scrollable wrapper
    var wrap = document.createElement('div');
    wrap.className = 'nashme-matrix-wrap';
    container.appendChild(wrap);

    // Table
    var table = document.createElement('table');
    table.className = 'nashme-matrix';
    wrap.appendChild(table);

    // Thead
    var thead = document.createElement('thead');
    table.appendChild(thead);

    // Axis label row
    var axisRow = document.createElement('tr');
    var axisCorner = document.createElement('th');
    axisCorner.className = 'nashme-corner';
    axisCorner.rowSpan = 2;
    axisCorner.innerHTML = '<span class="nashme-axis-label">Play ↓ / Draw →</span>';
    axisRow.appendChild(axisCorner);
    var axisSpan = document.createElement('th');
    axisSpan.colSpan = decks.length;
    axisSpan.className = 'nashme-axis-label';
    axisSpan.textContent = 'On the Draw';
    axisRow.appendChild(axisSpan);
    thead.appendChild(axisRow);

    // Column header row
    var headerRow = document.createElement('tr');
    for (var c = 0; c < decks.length; c++) {
      var th = document.createElement('th');
      th.textContent = deckLabel(decks[c]);
      th.title = deckLabel(decks[c]);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    // Tbody
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);

    for (var r = 0; r < decks.length; r++) {
      var tr = document.createElement('tr');
      // Row header
      var rowTh = document.createElement('th');
      rowTh.textContent = deckLabel(decks[r]);
      rowTh.title = deckLabel(decks[r]);
      if (r === 0) {
        // Add "On the Play" label to first row header area — already in corner cell
      }
      tr.appendChild(rowTh);

      for (var col = 0; col < decks.length; col++) {
        var td = document.createElement('td');
        if (r === col) {
          // Diagonal
          td.className = 'nashme-diagonal';
          td.textContent = '—';
        } else {
          var result = data.getMatchup(decks[r].id, decks[col].id);
          td.className = 'nashme-cell nashme-cell-' + (result || 'null');
          td.textContent = result || '·';
          td.dataset.playId = decks[r].id;
          td.dataset.drawId = decks[col].id;
          td.addEventListener('click', handleCellClick);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function handleCellClick(e) {
    var td = e.currentTarget;
    var playId = td.dataset.playId;
    var drawId = td.dataset.drawId;
    var data = window.NashmeData;
    if (!data) return;

    var current = data.getMatchup(playId, drawId);
    var next = nextResult(current);
    data.setMatchup(playId, drawId, next);

    // Update just this cell
    td.className = 'nashme-cell nashme-cell-' + (next || 'null');
    td.textContent = next || '·';
  }

  // --- Export ---
  window.NashmeMatrixUI = { render: render };

  // Auto-render on DOMContentLoaded if DOM not ready, else render now
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();

