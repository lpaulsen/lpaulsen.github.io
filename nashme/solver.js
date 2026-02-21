/**
 * NashMe Solver
 * Computes symmetric Nash equilibrium over decks using Multiplicative Weights Update.
 * Pure computation — no DOM interaction. Exports API on window.NashmeSolver.
 */
(function () {
  var ITERATIONS = 5000;
  var ETA = 0.02;       // learning rate
  var ALPHA = 0.05;     // rubber-band blend toward uniform
  var FLOOR = 1e-10;    // minimum weight to avoid numerical issues

  /**
   * Score a single game result from the perspective of the player on play.
   * W = winPoints, T = 1, L = 0, null = 1 (unknown treated as draw).
   */
  function scorePlay(result, winPoints) {
    if (result === 'W') return winPoints;
    if (result === 'T') return 1;
    if (result === 'L') return 0;
    return 1; // null → treat as draw
  }

  /**
   * Score a single game result from the perspective of the player on draw.
   * This is the inverted perspective: opponent's W = our 0, opponent's T = 1, opponent's L = our winPoints.
   * null = 1 (unknown treated as draw).
   */
  function scoreDraw(result, winPoints) {
    if (result === 'W') return 0;
    if (result === 'T') return 1;
    if (result === 'L') return winPoints;
    return 1; // null → treat as draw
  }

  /**
   * Build the payoff matrix M where M[i][j] is the total score for deck i vs deck j
   * across both play and draw games.
   */
  function buildPayoffMatrix(decks, matchups, winPoints) {
    var n = decks.length;
    var M = [];
    for (var i = 0; i < n; i++) {
      M[i] = [];
      for (var j = 0; j < n; j++) {
        var idI = decks[i].id;
        var idJ = decks[j].id;

        // Play game: i on play, j on draw → getMatchup(i, j)
        var playKey = idI + ':' + idJ;
        var playResult = matchups.hasOwnProperty(playKey) ? matchups[playKey] : null;

        // Draw game: j on play, i on draw → getMatchup(j, i)
        var drawKey = idJ + ':' + idI;
        var drawResult = matchups.hasOwnProperty(drawKey) ? matchups[drawKey] : null;

        // For the diagonal (mirror match), both keys are "i:i".
        // setMatchup prevents storing i:i, so both will be null → treated as T.
        // M[i][i] = scorePlay(null) + scoreDraw(null) = 1 + 1 = 2

        M[i][j] = scorePlay(playResult, winPoints) + scoreDraw(drawResult, winPoints);
      }
    }
    return M;
  }

  /**
   * Multiplicative Weights Update (Hedge) with time-averaging and rubber band.
   * Returns the time-averaged weight distribution.
   */
  function mwu(M, n) {
    if (n === 0) return [];
    if (n === 1) return [1.0];

    var uniform = 1.0 / n;
    var w = [];
    var avg = [];
    var i, j;

    // Initialize weights uniformly
    for (i = 0; i < n; i++) {
      w[i] = uniform;
      avg[i] = 0;
    }

    for (var iter = 0; iter < ITERATIONS; iter++) {
      // Compute expected payoff for each deck
      var E = [];
      for (i = 0; i < n; i++) {
        var sum = 0;
        for (j = 0; j < n; j++) {
          sum += w[j] * M[i][j];
        }
        E[i] = sum;
      }

      // Multiplicative update
      for (i = 0; i < n; i++) {
        w[i] = w[i] * (1 + ETA * E[i]);
      }

      // Rubber band: blend toward uniform
      for (i = 0; i < n; i++) {
        w[i] = (1 - ALPHA) * w[i] + ALPHA * uniform;
      }

      // Floor small weights
      for (i = 0; i < n; i++) {
        if (w[i] < FLOOR) w[i] = FLOOR;
      }

      // Normalize
      var total = 0;
      for (i = 0; i < n; i++) total += w[i];
      for (i = 0; i < n; i++) w[i] = w[i] / total;

      // Accumulate for time-average
      for (i = 0; i < n; i++) avg[i] += w[i];
    }

    // Compute time-averaged distribution
    for (i = 0; i < n; i++) avg[i] = avg[i] / ITERATIONS;

    return avg;
  }

  /**
   * Find the highest-priority unevaluated matchup pair.
   */
  function findNextPair(decks, matchups, weights) {
    var n = decks.length;
    var bestPriority = -1;
    var bestPair = null;

    for (var i = 0; i < n; i++) {
      for (var j = i; j < n; j++) {
        var idI = decks[i].id;
        var idJ = decks[j].id;
        var unevaluated = [];

        if (i === j) {
          // Mirror match: stored key would be "i:i" but setMatchup prevents it.
          // So mirror is always "unevaluated" in the data store.
          // However, we treat mirrors as known (T by default), so skip them.
          continue;
        }

        // Check both ordered matchups in the pair
        var keyIJ = idI + ':' + idJ;
        var keyJI = idJ + ':' + idI;

        if (!matchups.hasOwnProperty(keyIJ)) {
          unevaluated.push({ playId: idI, drawId: idJ });
        }
        if (!matchups.hasOwnProperty(keyJI)) {
          unevaluated.push({ playId: idJ, drawId: idI });
        }

        if (unevaluated.length === 0) continue;

        var priority = weights[idI] * weights[idJ];
        if (priority > bestPriority) {
          bestPriority = priority;
          bestPair = {
            deckA: weights[idI] >= weights[idJ] ? idI : idJ,
            deckB: weights[idI] >= weights[idJ] ? idJ : idI,
            unevaluated: unevaluated,
          };
        }
      }
    }

    return bestPair;
  }

  /**
   * Main entry point.
   */
  function compute(decks, matchups, winPoints) {
    var n = decks.length;

    // Edge cases: 0 or 1 deck
    if (n === 0) return { weights: {}, nextPair: null };
    if (n === 1) {
      var w = {};
      w[decks[0].id] = 1.0;
      return { weights: w, nextPair: null };
    }

    // Build payoff matrix and run MWU
    var M = buildPayoffMatrix(decks, matchups, winPoints);
    var avgWeights = mwu(M, n);

    // Convert to {deckId: weight} map
    var weights = {};
    for (var i = 0; i < n; i++) {
      weights[decks[i].id] = avgWeights[i];
    }

    // Find highest-priority unevaluated pair
    var nextPair = findNextPair(decks, matchups, weights);

    return { weights: weights, nextPair: nextPair };
  }

  // Export public API
  window.NashmeSolver = {
    compute: compute,
  };
})();

