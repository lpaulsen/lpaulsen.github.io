/**
 * NashMe Solver
 * Computes symmetric Nash equilibrium over decks using Multiplicative Weights Update.
 * Pure computation — no DOM interaction. Exports API on window.NashmeSolver.
 */
(function () {
  var ITERATIONS = 5000;
  var ETA = 0.02;       // learning rate
  var ALPHA = 0.001;    // rubber-band blend toward uniform
  var FLOOR = 1e-10;    // minimum weight to avoid numerical issues

  // Monte Carlo constants
  var SIM_COUNT = 100;       // Monte Carlo simulations
  var KAPPA = 30;            // Dirichlet concentration
  var GAMMA = 0.05;          // variance bonus strength

  // --- Dirichlet sampling infrastructure ---

  /** Box-Muller normal sampler */
  function randNormal() {
    var u1 = Math.random();
    var u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Marsaglia-Tsang Gamma(α, 1) sampler */
  function randGamma(alpha) {
    if (alpha < 1) {
      // Ahrens-Dieter boost
      return randGamma(alpha + 1) * Math.pow(Math.random(), 1 / alpha);
    }
    var d = alpha - 1/3;
    var c = 1 / Math.sqrt(9 * d);
    while (true) {
      var x, v;
      do {
        x = randNormal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      var u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** Dirichlet sampler */
  function randDirichlet(alphas) {
    var samples = [];
    var sum = 0;
    for (var i = 0; i < alphas.length; i++) {
      var g = randGamma(alphas[i]);
      samples.push(g);
      sum += g;
    }
    for (var i = 0; i < samples.length; i++) {
      samples[i] = samples[i] / sum;
    }
    return samples;
  }

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
        // Mirror matches can be stored and are evaluated normally.
        // If unevaluated, null → treated as T: scorePlay(null) + scoreDraw(null) = 1 + 1 = 2

        M[i][j] = scorePlay(playResult, winPoints) + scoreDraw(drawResult, winPoints);
      }
    }
    return M;
  }

  /**
   * Compute a similarity factor for the deck pool based on card overlap.
   * When many decks share 2/3 cards, returns a lower factor to reduce ALPHA further.
   * Range: 1.0 (no overlap) to 0.1 (all pairs overlap).
   */
  function computeSimilarityFactor(decks) {
    if (decks.length < 2) return 1.0;
    var pairsWithOverlap = 0;
    var totalPairs = 0;
    for (var i = 0; i < decks.length; i++) {
      for (var j = i + 1; j < decks.length; j++) {
        totalPairs++;
        var shared = 0;
        for (var a = 0; a < 3; a++) {
          for (var b = 0; b < 3; b++) {
            if (decks[i].cards[a].toLowerCase() === decks[j].cards[b].toLowerCase()) {
              shared++;
              break;
            }
          }
        }
        if (shared >= 2) pairsWithOverlap++;
      }
    }
    if (totalPairs === 0) return 1.0;
    var overlapRatio = pairsWithOverlap / totalPairs;
    return 1.0 - 0.9 * overlapRatio;
  }

  /**
   * Multiplicative Weights Update (Hedge) with time-averaging and rubber band.
   * Returns the time-averaged weight distribution.
   */
  function mwu(M, n, similarityFactor) {
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

    var iters = n <= 50 ? ITERATIONS : Math.max(100, Math.floor(5000000 / (n * n)));
    var E = new Array(n);
    for (var iter = 0; iter < iters; iter++) {
      // Compute expected payoff for each deck
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

      // Rubber band: blend toward uniform (scaled by similarity factor)
      var effectiveAlpha = ALPHA * (similarityFactor || 1.0);
      for (i = 0; i < n; i++) {
        w[i] = (1 - effectiveAlpha) * w[i] + effectiveAlpha * uniform;
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
    for (i = 0; i < n; i++) avg[i] = avg[i] / iters;

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
          // Mirror match: only one key "i:i" (same deck on play and draw)
          var mirrorKey = idI + ':' + idI;
          if (!matchups.hasOwnProperty(mirrorKey)) {
            unevaluated.push({ playId: idI, drawId: idI });
          }
        } else {
          // Check both ordered matchups in the pair
          var keyIJ = idI + ':' + idJ;
          var keyJI = idJ + ':' + idI;

          if (!matchups.hasOwnProperty(keyIJ)) {
            unevaluated.push({ playId: idI, drawId: idJ });
          }
          if (!matchups.hasOwnProperty(keyJI)) {
            unevaluated.push({ playId: idJ, drawId: idI });
          }
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
   * Classic solver — original MWU-only computation.
   */
  function computeClassic(decks, matchups, winPoints) {
    var n = decks.length;

    // Edge cases: 0 or 1 deck
    if (n === 0) return { weights: {}, nextPair: null, scores: null };
    if (n === 1) {
      var w = {};
      w[decks[0].id] = 1.0;
      return { weights: w, nextPair: null, scores: null };
    }

    // Build payoff matrix and run MWU
    var M = buildPayoffMatrix(decks, matchups, winPoints);
    var simFactor = n <= 100 ? computeSimilarityFactor(decks) : 1.0;
    var avgWeights = mwu(M, n, simFactor);

    // Convert to {deckId: weight} map
    var weights = {};
    for (var i = 0; i < n; i++) {
      weights[decks[i].id] = avgWeights[i];
    }

    // Find highest-priority unevaluated pair
    var nextPair = findNextPair(decks, matchups, weights);

    // Compute deterministic scores against the metagame
    var scores = {};
    for (var i = 0; i < n; i++) {
      var score = 0;
      for (var j = 0; j < n; j++) {
        score += avgWeights[j] * M[i][j];
      }
      scores[decks[i].id] = { p10: score, p50: score, p90: score };
    }

    return { weights: weights, nextPair: nextPair, scores: scores };
  }

  /**
   * Monte Carlo solver — MWU + Dirichlet sampling + variance-adjusted weights.
   */
  function computeMC(decks, matchups, winPoints) {
    var n = decks.length;
    if (n === 0) return { weights: {}, nextPair: null, scores: {} };
    if (n === 1) {
      var w = {}; w[decks[0].id] = 1.0;
      var s = {}; s[decks[0].id] = { p10: 2, p50: 2, p90: 2 };
      return { weights: w, nextPair: null, scores: s };
    }

    // Step 1: Run classic MWU to get base weights
    var M = buildPayoffMatrix(decks, matchups, winPoints);
    var simFactor = n <= 100 ? computeSimilarityFactor(decks) : 1.0;
    var baseWeights = mwu(M, n, simFactor);

    // Step 2: Monte Carlo simulation
    // Build Dirichlet alpha parameters
    var alphas = [];
    for (var i = 0; i < n; i++) {
      alphas.push(KAPPA * baseWeights[i]);
    }

    // Collect scores: allScores[i] = array of 100 scores for deck i
    var allScores = [];
    for (var i = 0; i < n; i++) allScores.push([]);

    for (var sim = 0; sim < SIM_COUNT; sim++) {
      var sampledW = randDirichlet(alphas);
      for (var i = 0; i < n; i++) {
        var score = 0;
        for (var j = 0; j < n; j++) {
          score += sampledW[j] * M[i][j];
        }
        allScores[i].push(score);
      }
    }

    // Step 3: Compute percentiles
    var scores = {};
    var variances = [];
    for (var i = 0; i < n; i++) {
      allScores[i].sort(function(a, b) { return a - b; });
      var arr = allScores[i];

      // p10 = avg of bottom 10
      var p10sum = 0;
      for (var k = 0; k < 10; k++) p10sum += arr[k];
      var p10 = p10sum / 10;

      // p50 = avg of middle 10 (indices 45-54)
      var p50sum = 0;
      for (var k = 45; k < 55; k++) p50sum += arr[k];
      var p50 = p50sum / 10;

      // p90 = avg of top 10
      var p90sum = 0;
      for (var k = 90; k < 100; k++) p90sum += arr[k];
      var p90 = p90sum / 10;

      scores[decks[i].id] = { p10: p10, p50: p50, p90: p90 };

      // Compute variance (stddev) for variance bonus
      var mean = 0;
      for (var k = 0; k < SIM_COUNT; k++) mean += arr[k];
      mean /= SIM_COUNT;
      var variance = 0;
      for (var k = 0; k < SIM_COUNT; k++) {
        var diff = arr[k] - mean;
        variance += diff * diff;
      }
      variances.push(Math.sqrt(variance / SIM_COUNT));
    }

    // Step 4: Variance-adjusted weights
    var maxVar = 0;
    for (var i = 0; i < n; i++) {
      if (variances[i] > maxVar) maxVar = variances[i];
    }

    var adjusted = [];
    for (var i = 0; i < n; i++) {
      var bonus = maxVar > 0 ? GAMMA * (variances[i] / maxVar) * baseWeights[i] : 0;
      adjusted.push(baseWeights[i] + bonus);
    }

    // Renormalize
    var total = 0;
    for (var i = 0; i < n; i++) total += adjusted[i];
    for (var i = 0; i < n; i++) adjusted[i] = adjusted[i] / total;

    // Build weights map
    var weights = {};
    for (var i = 0; i < n; i++) {
      weights[decks[i].id] = adjusted[i];
    }

    // Find next pair (using adjusted weights)
    var nextPair = findNextPair(decks, matchups, weights);

    return { weights: weights, nextPair: nextPair, scores: scores };
  }

  /**
   * Manual solver — uses user-provided weights directly.
   */
  function computeManual(decks, matchups, winPoints, manualWeights) {
    var n = decks.length;
    if (n === 0) return { weights: {}, nextPair: null, scores: {} };
    if (n === 1) {
      var w = {}; w[decks[0].id] = 1.0;
      var s = {}; s[decks[0].id] = { p10: 2, p50: 2, p90: 2 };
      return { weights: w, nextPair: null, scores: s };
    }

    // Use the provided manual weights directly
    var weights = {};
    var weightArr = [];
    for (var i = 0; i < n; i++) {
      var mw = manualWeights[decks[i].id];
      weights[decks[i].id] = (mw !== undefined) ? mw : 0;
      weightArr.push(weights[decks[i].id]);
    }

    // Build payoff matrix and compute deterministic scores
    var M = buildPayoffMatrix(decks, matchups, winPoints);
    var scores = {};
    for (var i = 0; i < n; i++) {
      var score = 0;
      for (var j = 0; j < n; j++) {
        score += weightArr[j] * M[i][j];
      }
      scores[decks[i].id] = { p10: score, p50: score, p90: score };
    }

    var nextPair = findNextPair(decks, matchups, weights);
    return { weights: weights, nextPair: nextPair, scores: scores };
  }

  /**
   * Dispatcher — routes to classic, Monte Carlo, or manual solver based on mode.
   */
  function compute(decks, matchups, winPoints, mode, manualWeights) {
    if (mode === 'manual') return computeManual(decks, matchups, winPoints, manualWeights || {});
    if (mode === 'mc') return computeMC(decks, matchups, winPoints);
    return computeClassic(decks, matchups, winPoints);
  }

  // Export public API
  window.NashmeSolver = {
    compute: compute,
    computeClassic: computeClassic,
    computeMC: computeMC,
    computeManual: computeManual,
  };
})();

