/**
 * NashMe Deck Management UI
 * Renders the deck list, add/edit form, and empty state.
 * Depends on window.NashmeData (data.js must load first).
 */
(function () {
  var data = window.NashmeData;
  var editingDeckId = null;

  // --- DOM References (set after render) ---
  var deckListEl, formEl, card1El, card2El, card3El, submitBtnEl, cancelBtnEl, emptyEl, errorsEl;

  // --- Rendering ---

  function getShowBanned() {
    var stored = localStorage.getItem('nashme_show_banned');
    return stored !== 'false'; // default true
  }

  function renderDeckList() {
    var decks = data.getDecks();
    deckListEl.innerHTML = '';

    if (decks.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    var showBanned = getShowBanned();

    for (var i = 0; i < decks.length; i++) {
      var deck = decks[i];
      var deckBanned = data.isDeckBanned(deck);
      var li = document.createElement('li');
      li.className = 'deck-item';
      if (deckBanned) {
        li.classList.add('deck-item--banned');
      }
      if (editingDeckId === deck.id) {
        li.classList.add('deck-item--editing');
      }
      li.setAttribute('data-deck-id', deck.id);

      // Hide banned decks if toggle is off
      if (deckBanned && !showBanned) {
        li.style.display = 'none';
      }

      var label = document.createElement('span');
      label.className = 'deck-cards';
      // Build card names with per-card banned styling
      var cardHtml = '';
      for (var c = 0; c < deck.cards.length; c++) {
        if (c > 0) cardHtml += ' · ';
        var cardName = deck.cards[c];
        if (data.isBanned(cardName)) {
          cardHtml += '<span class="deck-card--banned">' + cardName + '</span>';
        } else {
          cardHtml += cardName;
        }
      }
      label.innerHTML = cardHtml;
      li.appendChild(label);

      // Add banned badge
      if (deckBanned) {
        var badge = document.createElement('span');
        badge.className = 'deck-banned-badge';
        badge.textContent = '🚫';
        li.appendChild(badge);
      }

      var editBtn = document.createElement('button');
      editBtn.className = 'deck-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('data-deck-id', deck.id);
      li.appendChild(editBtn);

      deckListEl.appendChild(li);
    }
  }

  function populateForm(deck) {
    card1El.value = deck.cards[0];
    card2El.value = deck.cards[1];
    card3El.value = deck.cards[2];
    submitBtnEl.textContent = 'Save Deck';
    cancelBtnEl.style.display = '';
    editingDeckId = deck.id;
    card1El.focus();
    renderDeckList();
  }

  function resetForm() {
    card1El.value = '';
    card2El.value = '';
    card3El.value = '';
    submitBtnEl.textContent = 'Add Deck';
    cancelBtnEl.style.display = 'none';
    editingDeckId = null;
    renderDeckList();
  }

  // --- Validation Helpers ---

  function clearErrors() {
    if (errorsEl) errorsEl.innerHTML = '';
  }

  function showErrors(messages) {
    if (!errorsEl) return;
    errorsEl.innerHTML = '';
    for (var i = 0; i < messages.length; i++) {
      var p = document.createElement('p');
      p.textContent = messages[i];
      errorsEl.appendChild(p);
    }
  }

  function setSubmitting(busy) {
    submitBtnEl.disabled = busy;
    if (busy) {
      submitBtnEl.textContent = 'Validating\u2026';
    } else {
      submitBtnEl.textContent = editingDeckId ? 'Save Deck' : 'Add Deck';
    }
  }

  function validateCardWithDelay(cards, index, results) {
    if (index >= cards.length) {
      var corrected = [];
      var errors = [];
      for (var i = 0; i < results.length; i++) {
        if (results[i].valid) {
          corrected.push(results[i].correctedName || cards[i]);
        } else {
          errors.push('"' + cards[i] + '" is not a valid card name');
        }
      }
      return Promise.resolve({ valid: errors.length === 0, correctedCards: corrected, errors: errors });
    }
    return NashmeScryfall.validateCard(cards[index]).then(function (result) {
      results.push(result);
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(validateCardWithDelay(cards, index + 1, results)); }, 100);
      });
    });
  }

  function validateAllCards(cards) {
    var results = [];
    return validateCardWithDelay(cards, 0, results);
  }

  // --- Event Handlers ---

  function handleSubmit(e) {
    e.preventDefault();
    clearErrors();
    var cards = [card1El.value.trim(), card2El.value.trim(), card3El.value.trim()];
    if (!cards[0] || !cards[1] || !cards[2]) return;

    setSubmitting(true);

    validateAllCards(cards).then(function (result) {
      if (!result.valid) {
        showErrors(result.errors);
        setSubmitting(false);
        return;
      }

      var finalCards = result.correctedCards;
      try {
        if (editingDeckId) {
          data.updateDeck(editingDeckId, finalCards);
        } else {
          data.addDeck(finalCards);
        }
      } catch (err) {
        showErrors([err.message]);
        setSubmitting(false);
        return;
      }
      if (window.NashmeEquilibriumUI) NashmeEquilibriumUI.refresh(); else if (window.NashmeMatrixUI) NashmeMatrixUI.render();
      setSubmitting(false);
      resetForm();
    });
  }

  function handleCancel() {
    resetForm();
  }

  function handleDeckClick(e) {
    var btn = e.target.closest('.deck-edit-btn');
    if (!btn) return;
    var deckId = btn.getAttribute('data-deck-id');
    var decks = data.getDecks();
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === deckId) {
        populateForm(decks[i]);
        return;
      }
    }
  }

  // --- Bootstrap ---

  function init() {
    var container = document.getElementById('deck-manager');
    if (!container) return;

    var showBannedChecked = getShowBanned() ? ' checked' : '';
    container.innerHTML =
      '<h2>Decks</h2>' +
      '<label class="deck-banned-toggle"><input type="checkbox" id="show-banned-toggle"' + showBannedChecked + '> Show banned decks</label>' +
      '<p class="empty-state" id="deck-empty">No decks yet. Add one below!</p>' +
      '<ul class="deck-list" id="deck-list"></ul>' +
      '<form class="deck-form" id="deck-form">' +
        '<input type="text" id="card1" placeholder="Card 1" autocomplete="off">' +
        '<input type="text" id="card2" placeholder="Card 2" autocomplete="off">' +
        '<input type="text" id="card3" placeholder="Card 3" autocomplete="off">' +
        '<div class="deck-form-errors" id="deck-form-errors"></div>' +
        '<div class="deck-form-actions">' +
          '<button type="submit" id="deck-submit">Add Deck</button>' +
          '<button type="button" id="deck-cancel" style="display:none">Cancel</button>' +
        '</div>' +
      '</form>';

    deckListEl = document.getElementById('deck-list');
    formEl = document.getElementById('deck-form');
    card1El = document.getElementById('card1');
    card2El = document.getElementById('card2');
    card3El = document.getElementById('card3');
    submitBtnEl = document.getElementById('deck-submit');
    cancelBtnEl = document.getElementById('deck-cancel');
    emptyEl = document.getElementById('deck-empty');
    errorsEl = document.getElementById('deck-form-errors');

    formEl.addEventListener('submit', handleSubmit);
    cancelBtnEl.addEventListener('click', handleCancel);
    deckListEl.addEventListener('click', handleDeckClick);

    // Show/hide banned decks toggle
    var showBannedToggle = document.getElementById('show-banned-toggle');
    if (showBannedToggle) {
      showBannedToggle.addEventListener('change', function () {
        localStorage.setItem('nashme_show_banned', this.checked ? 'true' : 'false');
        renderDeckList();
      });
    }

    renderDeckList();
  }

  // --- Export ---
  window.NashmeDecksUI = { render: renderDeckList };

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

