/**
 * NashMe Deck Management UI
 * Renders the deck list, add/edit form, and empty state.
 * Depends on window.NashmeData (data.js must load first).
 */
(function () {
  var data = window.NashmeData;
  var editingDeckId = null;

  // --- DOM References (set after render) ---
  var deckListEl, formEl, card1El, card2El, card3El, submitBtnEl, cancelBtnEl, emptyEl;

  // --- Rendering ---

  function renderDeckList() {
    var decks = data.getDecks();
    deckListEl.innerHTML = '';

    if (decks.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    for (var i = 0; i < decks.length; i++) {
      var deck = decks[i];
      var li = document.createElement('li');
      li.className = 'deck-item';
      if (editingDeckId === deck.id) {
        li.classList.add('deck-item--editing');
      }
      li.setAttribute('data-deck-id', deck.id);

      var label = document.createElement('span');
      label.className = 'deck-cards';
      label.textContent = deck.cards.join(' · ');
      li.appendChild(label);

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

  // --- Event Handlers ---

  function handleSubmit(e) {
    e.preventDefault();
    var cards = [card1El.value.trim(), card2El.value.trim(), card3El.value.trim()];
    if (!cards[0] || !cards[1] || !cards[2]) return;

    try {
      if (editingDeckId) {
        data.updateDeck(editingDeckId, cards);
      } else {
        data.addDeck(cards);
      }
    } catch (err) {
      alert(err.message);
      return;
    }
    if (window.NashmeMatrixUI) window.NashmeMatrixUI.render();
    resetForm();
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

    container.innerHTML =
      '<h2>Decks</h2>' +
      '<p class="empty-state" id="deck-empty">No decks yet. Add one below!</p>' +
      '<ul class="deck-list" id="deck-list"></ul>' +
      '<form class="deck-form" id="deck-form">' +
        '<input type="text" id="card1" placeholder="Card 1" autocomplete="off">' +
        '<input type="text" id="card2" placeholder="Card 2" autocomplete="off">' +
        '<input type="text" id="card3" placeholder="Card 3" autocomplete="off">' +
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

    formEl.addEventListener('submit', handleSubmit);
    cancelBtnEl.addEventListener('click', handleCancel);
    deckListEl.addEventListener('click', handleDeckClick);

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

