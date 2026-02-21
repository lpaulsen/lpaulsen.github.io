/**
 * NashMe Data Management UI
 * Export, Import, and Wipe controls.
 * Depends on window.NashmeData (data.js must load first).
 */
(function () {
  'use strict';

  var data = window.NashmeData;

  function refreshUIs() {
    if (window.NashmeDecksUI) NashmeDecksUI.render();
    if (window.NashmeMatrixUI) NashmeMatrixUI.render();
  }

  // --- Export ---

  function handleExport() {
    var exported = data.exportData();
    var json = JSON.stringify(exported, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nashme-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Import ---

  function handleImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var obj = JSON.parse(e.target.result);
          data.importData(obj);
          refreshUIs();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  // --- Wipe ---

  function handleWipe() {
    if (!confirm('Are you sure? This will delete all decks and matchups.')) return;
    data.wipeAll();
    refreshUIs();
  }

  // --- Bootstrap ---

  function init() {
    var container = document.getElementById('data-management');
    if (!container) return;

    container.innerHTML =
      '<h2>Data Management</h2>' +
      '<div class="data-mgmt-actions">' +
        '<button type="button" id="btn-export">Export JSON</button>' +
        '<button type="button" id="btn-import">Import JSON</button>' +
        '<button type="button" id="btn-wipe" class="btn-danger">Wipe All Data</button>' +
      '</div>';

    document.getElementById('btn-export').addEventListener('click', handleExport);
    document.getElementById('btn-import').addEventListener('click', handleImport);
    document.getElementById('btn-wipe').addEventListener('click', handleWipe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

