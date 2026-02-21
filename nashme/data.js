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

  // --- Deck API ---

  function getDecks() {
    return decks.slice(); // return a copy
  }

  function addDeck(cards) {
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error('A deck must have exactly 3 cards');
    }
    var deck = {
      id: generateId(),
      cards: [cards[0], cards[1], cards[2]],
    };
    decks.push(deck);
    save();
    return { id: deck.id, cards: deck.cards.slice() };
  }

  function updateDeck(id, cards) {
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error('A deck must have exactly 3 cards');
    }
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === id) {
        decks[i].cards = [cards[0], cards[1], cards[2]];
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
    if (playId === drawId) {
      throw new Error('Play and draw deck must be different');
    }
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
    save: save,
    load: load,
  };
})();

