/**
 * NashMe Banlist Management UI
 * Collapsible section for managing banned cards.
 * Depends on window.NashmeData, window.NashmeScryfall.
 * Exports API on window.NashmeBanlistUI.
 */
(function () {
  'use strict';

  var COLLAPSED_KEY = 'nashme_banlist_collapsed';
  var data = window.NashmeData;

  var collapsed = true;
  var containerEl;

  function isCollapsed() {
    var stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === 'false') return false;
    return true; // collapsed by default
  }

  function setCollapsed(val) {
    collapsed = val;
    localStorage.setItem(COLLAPSED_KEY, val ? 'true' : 'false');
  }

  // --- Render banlist items only (preserves collapse state) ---

  function render() {
    var itemsEl = containerEl && containerEl.querySelector('.banlist-items');
    if (!itemsEl) return;
    var list = data.getBanlist();

    // Update header count
    var countEl = containerEl.querySelector('.banlist-count');
    if (countEl) countEl.textContent = '(' + list.length + ')';

    itemsEl.innerHTML = '';
    if (list.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'banlist-empty';
      empty.textContent = 'No banned cards.';
      itemsEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < list.length; i++) {
      var item = document.createElement('span');
      item.className = 'banlist-item';
      item.textContent = list[i] + ' ';

      var removeBtn = document.createElement('button');
      removeBtn.className = 'banlist-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.setAttribute('data-card', list[i]);
      removeBtn.addEventListener('click', handleRemove);
      item.appendChild(removeBtn);

      itemsEl.appendChild(item);
    }
  }

  function handleRemove(e) {
    var cardName = e.currentTarget.getAttribute('data-card');
    data.removeBan(cardName);
    render();
    if (window.NashmeEquilibriumUI) NashmeEquilibriumUI.refresh();
    if (window.NashmeDecksUI) NashmeDecksUI.render();
  }

  function handleToggle() {
    setCollapsed(!collapsed);
    var body = containerEl.querySelector('.banlist-body');
    var arrow = containerEl.querySelector('.banlist-toggle-arrow');
    if (collapsed) {
      body.classList.add('collapsed');
      arrow.textContent = '\u25b6';
    } else {
      body.classList.remove('collapsed');
      arrow.textContent = '\u25bc';
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    var inputEl = containerEl.querySelector('.banlist-input');
    var btnEl = containerEl.querySelector('.banlist-add-btn');
    var errorEl = containerEl.querySelector('.banlist-error');

    var lines = inputEl.value.split('\n');
    var names = [];
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed) names.push(trimmed);
    }
    if (names.length === 0) return;

    errorEl.textContent = '';
    btnEl.disabled = true;
    btnEl.textContent = 'Validating\u2026';

    var invalid = [];
    var added = 0;
    var idx = 0;

    function processNext() {
      if (idx >= names.length) {
        // All done
        if (added > 0) {
          render();
          if (window.NashmeEquilibriumUI) NashmeEquilibriumUI.refresh();
          if (window.NashmeDecksUI) NashmeDecksUI.render();
        }
        inputEl.value = '';
        btnEl.disabled = false;
        btnEl.textContent = 'Ban Cards';
        if (invalid.length > 0) {
          errorEl.textContent = 'Not found: ' + invalid.join(', ');
          inputEl.value = invalid.join('\n');
        }
        return;
      }

      var name = names[idx];
      idx++;

      NashmeScryfall.validateCard(name).then(function (result) {
        if (!result.valid) {
          invalid.push(name);
        } else {
          var corrected = result.correctedName || name;
          data.addBan(corrected);
          added++;
        }
        processNext();
      });
    }

    processNext();
  }

  // --- Bootstrap ---

  function init() {
    containerEl = document.getElementById('banlist-manager');
    if (!containerEl) return;

    collapsed = isCollapsed();
    var list = data.getBanlist();

    containerEl.innerHTML =
      '<div class="banlist-section">' +
        '<div class="banlist-header">' +
          '<span class="banlist-toggle-arrow">' + (collapsed ? '\u25b6' : '\u25bc') + '</span>' +
          '<h2>Banlist <span class="banlist-count">(' + list.length + ')</span></h2>' +
        '</div>' +
        '<div class="banlist-body' + (collapsed ? ' collapsed' : '') + '">' +
          '<form class="banlist-form">' +
            '<textarea class="banlist-input" placeholder="One card name per line" rows="3"></textarea>' +
            '<button type="submit" class="banlist-add-btn">Ban Cards</button>' +
          '</form>' +
          '<p class="banlist-error"></p>' +
          '<div class="banlist-items"></div>' +
        '</div>' +
      '</div>';

    containerEl.querySelector('.banlist-header').addEventListener('click', handleToggle);
    containerEl.querySelector('.banlist-form').addEventListener('submit', handleAdd);

    render();
  }

  // --- Export ---
  window.NashmeBanlistUI = { render: render };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

