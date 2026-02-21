(function () {
  // Persistent visit counter using localStorage
  var STORAGE_KEY = 'nashme_visit_count';
  var count = parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0;
  count++;
  localStorage.setItem(STORAGE_KEY, count);

  var suffix = count === 1 ? 'time' : 'times';
  document.getElementById('visit-count').textContent =
    'You have visited ' + count + ' ' + suffix + '.';
})();

