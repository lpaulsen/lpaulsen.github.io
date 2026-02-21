/**
 * NashMe Data Layer
 * Pure-JS data module for managing decks and matchups with localStorage persistence.
 * No DOM interaction — exports API on window.NashmeData.
 */
(function () {
  var STORAGE_KEY = 'nashme_data';
  var nextId = 1;
  var decks = [];
  var matchups = {};

  // --- Persistence ---

  function save() {
    var payload = {
      nextId: nextId,
      decks: decks,
      matchups: matchups,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function load() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      var payload = JSON.parse(raw);
      nextId = typeof payload.nextId === 'number' ? payload.nextId : 1;
      decks = Array.isArray(payload.decks) ? payload.decks : [];
      matchups =
        payload.matchups && typeof payload.matchups === 'object'
          ? payload.matchups
          : {};
    } catch (e) {
      // Corrupted data — start fresh
      nextId = 1;
      decks = [];
      matchups = {};
    }
  }

  // --- ID generation ---

  function generateId() {
    var id = 'deck-' + nextId;
    nextId++;
    return id;
  }

  // --- Helpers ---

  function normalizeCards(cards) {
    return [cards[0], cards[1], cards[2]].sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function hasDuplicateDeck(cards, excludeId) {
    var sorted = normalizeCards(cards);
    for (var i = 0; i < decks.length; i++) {
      if (excludeId && decks[i].id === excludeId) continue;
      var existing = decks[i].cards;
      if (
        existing[0] === sorted[0] &&
        existing[1] === sorted[1] &&
        existing[2] === sorted[2]
      ) {
        return true;
      }
    }
    return false;
  }

  // --- Deck API ---

  function getDecks() {
    return decks.slice(); // return a copy
  }

  function addDeck(cards) {
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error('A deck must have exactly 3 cards');
    }
    var sorted = normalizeCards(cards);
    if (hasDuplicateDeck(sorted)) {
      throw new Error('A deck with these cards already exists');
    }
    var deck = {
      id: generateId(),
      cards: sorted,
    };
    decks.push(deck);
    save();
    return { id: deck.id, cards: deck.cards.slice() };
  }

  function updateDeck(id, cards) {
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error('A deck must have exactly 3 cards');
    }
    var sorted = normalizeCards(cards);
    if (hasDuplicateDeck(sorted, id)) {
      throw new Error('A deck with these cards already exists');
    }
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === id) {
        decks[i].cards = sorted;
        save();
        return { id: decks[i].id, cards: decks[i].cards.slice() };
      }
    }
    throw new Error('Deck not found: ' + id);
  }

  // --- Matchup API ---

  function matchupKey(playId, drawId) {
    return playId + ':' + drawId;
  }

  function getMatchup(playId, drawId) {
    var key = matchupKey(playId, drawId);
    var val = matchups[key];
    return val === undefined ? null : val;
  }

  function setMatchup(playId, drawId, result) {
    if (result !== 'W' && result !== 'T' && result !== 'L' && result !== null) {
      throw new Error('Result must be "W", "T", "L", or null');
    }
    var key = matchupKey(playId, drawId);
    if (result === null) {
      delete matchups[key];
    } else {
      matchups[key] = result;
    }
    save();
  }

  function getAllMatchups() {
    var copy = {};
    for (var key in matchups) {
      if (matchups.hasOwnProperty(key)) {
        copy[key] = matchups[key];
      }
    }
    return copy;
  }

  // --- Import / Export / Wipe ---

  function exportData() {
    return {
      decks: JSON.parse(JSON.stringify(decks)),
      matchups: getAllMatchups(),
    };
  }

  function importData(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Import data must be an object');
    }
    if (!Array.isArray(obj.decks)) {
      throw new Error('Import data must contain a "decks" array');
    }
    if (!obj.matchups || typeof obj.matchups !== 'object') {
      throw new Error('Import data must contain a "matchups" object');
    }
    // Validate each deck
    var maxIdNum = 0;
    for (var i = 0; i < obj.decks.length; i++) {
      var d = obj.decks[i];
      if (!d || typeof d.id !== 'string' || !Array.isArray(d.cards)) {
        throw new Error('Each deck must have an "id" string and a "cards" array');
      }
      // Extract numeric portion to avoid ID collisions
      var parts = d.id.match(/^deck-(\d+)$/);
      if (parts) {
        var num = parseInt(parts[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    }
    decks = JSON.parse(JSON.stringify(obj.decks));
    matchups = {};
    for (var key in obj.matchups) {
      if (obj.matchups.hasOwnProperty(key)) {
        matchups[key] = obj.matchups[key];
      }
    }
    nextId = maxIdNum + 1;
    save();
  }

  function wipeAll() {
    decks = [];
    matchups = {};
    nextId = 1;
    save();
  }

  // --- Auto-load on initialization ---
  load();

  // --- Export public API ---
  window.NashmeData = {
    getDecks: getDecks,
    addDeck: addDeck,
    updateDeck: updateDeck,
    getMatchup: getMatchup,
    setMatchup: setMatchup,
    getAllMatchups: getAllMatchups,
    exportData: exportData,
    importData: importData,
    wipeAll: wipeAll,
    save: save,
    load: load,
  };
})();

