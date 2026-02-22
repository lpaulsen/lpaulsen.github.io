/**
 * NashMe 3CB Import
 * Parses 3cardblind.com match history (tab-separated or CSV) and imports
 * decks + matchup results into NashmeData.
 * Exports API on window.Nashme3CBImport.
 */
(function () {
  'use strict';

  var data = window.NashmeData;

  // --- RFC 4180 CSV parser ---

  function parseCSVRow(line) {
    var fields = [];
    var i = 0;
    var len = line.length;
    while (i <= len) {
      if (i === len) { fields.push(''); break; }
      if (line[i] === '"') {
        // Quoted field
        var val = '';
        i++; // skip opening quote
        while (i < len) {
          if (line[i] === '"') {
            if (i + 1 < len && line[i + 1] === '"') {
              val += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            val += line[i];
            i++;
          }
        }
        fields.push(val);
        if (i < len && line[i] === ',') i++; // skip comma
      } else {
        // Unquoted field
        var start = i;
        while (i < len && line[i] !== ',') i++;
        fields.push(line.substring(start, i));
        if (i < len) i++; // skip comma
      }
    }
    return fields;
  }

  function parseRows(text) {
    // Normalize line endings
    var cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = cleaned.split('\n');
    if (lines.length === 0) return [];

    // Detect delimiter: if first line contains tabs, use tab splitting
    var useTabs = lines[0].indexOf('\t') !== -1;

    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var fields = useTabs ? line.split('\t') : parseCSVRow(line);
      rows.push(fields);
    }
    return rows;
  }

  // --- Column detection ---

  function findColumns(headerRow) {
    var cols = { decklist: -1, opponentDecklist: -1, turnOrder: -1, result: -1 };
    for (var i = 0; i < headerRow.length; i++) {
      var name = headerRow[i].trim().toLowerCase();
      if (name === 'decklist') cols.decklist = i;
      else if (name === 'opponent decklist') cols.opponentDecklist = i;
      else if (name === 'turn order') cols.turnOrder = i;
      else if (name === 'result') cols.result = i;
    }
    return cols;
  }

  // --- Deck normalization (mirrors NashmeData.normalizeCards) ---

  function normalizeCards(cards) {
    return [cards[0], cards[1], cards[2]].sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function deckKey(sortedCards) {
    return sortedCards.join('|||');
  }

  // --- Find or create deck ---

  function buildDeckMap() {
    var decks = data.getDecks();
    var map = {};
    for (var i = 0; i < decks.length; i++) {
      map[deckKey(decks[i].cards)] = decks[i].id;
    }
    return map;
  }

  function findOrCreateDeck(cardNames, deckMap) {
    var sorted = normalizeCards(cardNames);
    var key = deckKey(sorted);
    if (deckMap[key]) return { id: deckMap[key], created: false };
    var newDeck = data.addDeck(sorted);
    deckMap[key] = newDeck.id;
    return { id: newDeck.id, created: true };
  }

  // --- Parse decklist string ("Card A | Card B | Card C") ---

  function parseDeckCards(decklistStr) {
    var parts = decklistStr.split('|');
    if (parts.length !== 3) return null;
    var cards = [];
    for (var i = 0; i < 3; i++) {
      var card = parts[i].trim();
      if (!card) return null;
      cards.push(card);
    }
    return cards;
  }

  // --- Map result from user perspective to play-deck perspective ---

  function mapResult(userResult) {
    var r = userResult.trim().toLowerCase();
    if (r === 'win') return 'W';
    if (r === 'loss' || r === 'lose') return 'L';
    if (r === 'tie' || r === 'draw') return 'T';
    return null;
  }

  // --- Main import logic ---

  function doImport(text) {
    var rows = parseRows(text);
    if (rows.length < 2) return { error: 'No valid match data found. Check the format.' };

    var cols = findColumns(rows[0]);
    if (cols.decklist === -1 || cols.opponentDecklist === -1 ||
        cols.turnOrder === -1 || cols.result === -1) {
      return { error: 'Missing required columns (Decklist, Opponent Decklist, Turn Order, Result).' };
    }

    var deckMap = buildDeckMap();
    var decksCreated = 0;
    var matchupsSet = 0;
    var skipped = 0;
    var conflicts = 0;

    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];

      // Skip rows that don't have enough columns
      if (row.length <= Math.max(cols.decklist, cols.opponentDecklist, cols.turnOrder, cols.result)) {
        skipped++;
        continue;
      }

      var decklistStr = row[cols.decklist].trim();
      var oppDecklistStr = row[cols.opponentDecklist].trim();
      var turnOrder = row[cols.turnOrder].trim().toLowerCase();
      var userResult = mapResult(row[cols.result]);

      if (!decklistStr || !oppDecklistStr || !userResult) {
        skipped++;
        continue;
      }

      var userCards = parseDeckCards(decklistStr);
      var oppCards = parseDeckCards(oppDecklistStr);
      if (!userCards || !oppCards) {
        skipped++;
        continue;
      }

      // Resolve decks
      var userDeck = findOrCreateDeck(userCards, deckMap);
      var oppDeck = findOrCreateDeck(oppCards, deckMap);
      if (userDeck.created) decksCreated++;
      if (oppDeck.created) decksCreated++;

      // Determine play/draw decks and result from play-deck perspective
      var playDeckId, drawDeckId, playResult;

      if (turnOrder === '1st' || turnOrder === 'first') {
        // User is on the play
        playDeckId = userDeck.id;
        drawDeckId = oppDeck.id;
        playResult = userResult; // W/L/T as-is
      } else if (turnOrder === '2nd' || turnOrder === 'second') {
        // User is on the draw; play deck is opponent
        playDeckId = oppDeck.id;
        drawDeckId = userDeck.id;
        // Flip W/L from play-deck perspective
        if (userResult === 'W') playResult = 'L';
        else if (userResult === 'L') playResult = 'W';
        else playResult = 'T';
      } else {
        skipped++;
        continue;
      }

      // Check for conflict (existing different result)
      var existing = data.getMatchup(playDeckId, drawDeckId);
      if (existing !== null && existing !== playResult) {
        conflicts++;
      }

      data.setMatchup(playDeckId, drawDeckId, playResult);
      matchupsSet++;
    }

    data.save();

    if (matchupsSet === 0 && decksCreated === 0) {
      return { error: 'No valid match data found. Check the format.' };
    }

    return {
      decksCreated: decksCreated,
      matchupsSet: matchupsSet,
      skipped: skipped,
      conflicts: conflicts,
    };
  }

  // --- UI ---

  var sectionEl = null;

  function showImportUI() {
    var container = document.getElementById('data-management');
    if (!container) return;

    // Toggle visibility if already present
    if (sectionEl) {
      var isHidden = sectionEl.style.display === 'none';
      sectionEl.style.display = isHidden ? '' : 'none';
      if (isHidden) {
        var ta = sectionEl.querySelector('.import-3cb-textarea');
        if (ta) ta.focus();
      }
      return;
    }

    sectionEl = document.createElement('div');
    sectionEl.className = 'import-3cb-section';
    sectionEl.innerHTML =
      '<h3>Import 3CB Match History</h3>' +
      '<textarea class="import-3cb-textarea" placeholder="Paste 3CB match history CSV here..."></textarea>' +
      '<div class="import-3cb-actions">' +
        '<button type="button" class="import-3cb-btn" id="btn-import-3cb-go" disabled>Import</button>' +
        '<button type="button" class="import-3cb-cancel" id="btn-import-3cb-cancel">Cancel</button>' +
      '</div>' +
      '<div class="import-3cb-results" style="display:none"></div>';

    container.appendChild(sectionEl);

    var textarea = sectionEl.querySelector('.import-3cb-textarea');
    var importBtn = sectionEl.querySelector('#btn-import-3cb-go');
    var cancelBtn = sectionEl.querySelector('#btn-import-3cb-cancel');
    var resultsEl = sectionEl.querySelector('.import-3cb-results');

    textarea.addEventListener('input', function () {
      importBtn.disabled = !textarea.value.trim();
    });

    importBtn.addEventListener('click', function () {
      resultsEl.style.display = 'none';
      var result = doImport(textarea.value);
      resultsEl.style.display = '';

      if (result.error) {
        resultsEl.innerHTML = '<span class="error">' + result.error + '</span>';
      } else {
        var parts = [];
        parts.push('Created ' + result.decksCreated + ' deck' + (result.decksCreated !== 1 ? 's' : ''));
        parts.push('set ' + result.matchupsSet + ' matchup' + (result.matchupsSet !== 1 ? 's' : ''));
        if (result.conflicts > 0) {
          parts.push(result.conflicts + ' conflict' + (result.conflicts !== 1 ? 's' : '') + ' overwritten');
        }
        var cls = result.conflicts > 0 ? 'warning' : 'success';
        var msg = parts.join(', ') + '.';
        if (result.skipped > 0) {
          msg += ' (' + result.skipped + ' row' + (result.skipped !== 1 ? 's' : '') + ' skipped)';
        }
        resultsEl.innerHTML = '<span class="' + cls + '">' + msg + '</span>';

        // Refresh UIs
        if (window.NashmeEquilibriumUI) NashmeEquilibriumUI.refresh();
        if (window.NashmeDecksUI) NashmeDecksUI.render();
        if (window.NashmeBanlistUI) NashmeBanlistUI.render();
      }
    });

    cancelBtn.addEventListener('click', function () {
      sectionEl.style.display = 'none';
      textarea.value = '';
      resultsEl.style.display = 'none';
      importBtn.disabled = true;
    });

    textarea.focus();
  }

  // --- Export ---
  window.Nashme3CBImport = { show: showImportUI };
})();

