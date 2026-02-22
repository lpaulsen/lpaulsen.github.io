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
  var banlist = [];

  // --- Persistence ---

  function save() {
    var payload = {
      nextId: nextId,
      decks: decks,
      matchups: matchups,
      banlist: banlist,
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
      banlist = Array.isArray(payload.banlist) ? payload.banlist : [];
    } catch (e) {
      // Corrupted data — start fresh
      nextId = 1;
      decks = [];
      matchups = {};
      banlist = [];
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
      banlist: banlist.slice(),
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
    banlist = Array.isArray(obj.banlist) ? obj.banlist.slice() : [];
    nextId = maxIdNum + 1;
    save();
  }

  function wipeAll() {
    decks = [];
    matchups = {};
    banlist = [];
    nextId = 1;
    save();
  }

  // --- Banlist API ---

  function getBanlist() {
    return banlist.slice(); // return a copy
  }

  function addBan(cardName) {
    var name = cardName.trim();
    if (!name) return;
    // Check if already banned (case-insensitive)
    var lower = name.toLowerCase();
    for (var i = 0; i < banlist.length; i++) {
      if (banlist[i].toLowerCase() === lower) return; // already banned
    }
    banlist.push(name);
    // Sort case-insensitively
    banlist.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    save();
  }

  function removeBan(cardName) {
    var lower = cardName.trim().toLowerCase();
    for (var i = 0; i < banlist.length; i++) {
      if (banlist[i].toLowerCase() === lower) {
        banlist.splice(i, 1);
        save();
        return;
      }
    }
  }

  function isBanned(cardName) {
    var lower = cardName.trim().toLowerCase();
    for (var i = 0; i < banlist.length; i++) {
      if (banlist[i].toLowerCase() === lower) return true;
    }
    return false;
  }

  function isDeckBanned(deck) {
    if (!deck || !deck.cards) return false;
    for (var i = 0; i < deck.cards.length; i++) {
      if (isBanned(deck.cards[i])) return true;
    }
    return false;
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
    getBanlist: getBanlist,
    addBan: addBan,
    removeBan: removeBan,
    isBanned: isBanned,
    isDeckBanned: isDeckBanned,
  };
})();

