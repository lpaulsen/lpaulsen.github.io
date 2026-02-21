/**
 * NashMe Scryfall API Helpers
 * Provides card validation and image URL generation via the Scryfall API.
 * Exports API on window.NashmeScryfall.
 */
(function () {
  var API_BASE = 'https://api.scryfall.com/cards/named';

  /**
   * Validate a card name against the Scryfall API.
   * @param {string} name - Card name to validate.
   * @returns {Promise<{valid: boolean, correctedName: string|null}>}
   */
  function validateCard(name) {
    var url = API_BASE + '?exact=' + encodeURIComponent(name.trim());
    return fetch(url).then(function (response) {
      if (response.status === 200) {
        return response.json().then(function (data) {
          return { valid: true, correctedName: data.name };
        });
      }
      if (response.status === 404) {
        return { valid: false, correctedName: null };
      }
      // Unexpected status — fail open
      return { valid: true, correctedName: null };
    }).catch(function () {
      // Network error — fail open, don't block deck creation
      return { valid: true, correctedName: null };
    });
  }

  /**
   * Build a Scryfall image URL for a card.
   * The returned URL can be used directly as an <img> src — the browser
   * follows Scryfall's redirect to the actual image CDN.
   * @param {string} cardName - Exact card name.
   * @param {string} [version='small'] - Image version (small, normal, large, etc.).
   * @returns {string}
   */
  function getImageUrl(cardName, version) {
    var v = version || 'small';
    return API_BASE + '?format=image&version=' + v + '&exact=' + encodeURIComponent(cardName.trim());
  }

  // --- Export public API ---
  window.NashmeScryfall = {
    validateCard: validateCard,
    getImageUrl: getImageUrl,
  };
})();

