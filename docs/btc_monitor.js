#!/usr/bin/env node

/**
 * BTC CYCLE BOTTOM MONITOR - GitHub Actions Edition
 * Runs on schedule (bi-weekly Monday & Thursday 10 AM UTC)
 * 
 * No dependencies needed. Runs pure Node.js with built-in fetch.
 * Output saved to logs and GitHub commit history.
 */

// ============================================================================
// DATA FETCHERS - All public free endpoints
// ============================================================================

async function fetchBtcPrice() {
  const sources = [
    {
      name: "Binance",
      fetch: async () => {
        const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
          timeout: 5000
        });
        const data = await res.json();
        return parseFloat(data.price);
      }
    },
    {
      name: "Bybit",
      fetch: async () => {
        const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT", {
          timeout: 5000
        });
        const data = await res.json();
        return parseFloat(data.result.list[0].lastPrice);
      }
    }
  ];

  for (const source of sources) {
    try {
      const price = await source.fetch();
      console.log(`✓ Price from ${source.name}: $${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
      return price;
    } catch (e) {
      console.log(`  ✗ ${source.name} failed: ${e.message.slice(0, 40)}`);
    }
  }

  console.log("❌ All price sources failed");
  return null;
}

async function fetchBtcOhlc(days = 90) {
  try {
    const limit = Math.min(days, 1000); // Binance max 1000
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", "BTCUSDT");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("limit", limit);

    const res = await fetch(url.toString(), { timeout: 10000 });
    const candles = await res.json();

    if (!Array.isArray(candles)) throw new Error("Invalid response");

    const closes = candles.map(c => parseFloat(c[4]));

    return {
      current: closes[closes.length - 1],
      high90d: Math.max(...closes),
      low90d: Math.min(...closes),
      ago30d: closes.length >= 30 ? closes[closes.length - 30] : closes[0],
      allCloses: closes
    };
  } catch (e) {
    console.log(`  ✗ OHLC fetch failed: ${e.message.slice(0, 40)}`);
    return null;
  }
}

// ============================================================================
// METRIC CALCULATIONS
// ============================================================================

function estimateMvrvZscore(price) {
  const athRef = 126000;
  const priceRatio = price / athRef;
  let mvrvZ = 3.8 * priceRatio - 0.5;
  mvrvZ = Math.max(0.1, Math.min(5.0, mvrvZ));
  return Math.round(mvrvZ * 100) / 100;
}

function estimateAsorp(closes) {
  if (closes.length < 7) return 1.0;

  const current = closes[closes.length - 1];
  const ma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const asorp = current / ma7;

  return Math.round(asorp * 1000) / 1000;
}

function estimateVolatility(closes) {
  if (closes.length < 30) return 0;

  const recent = closes.slice(-30);
  const returns = [];

  for (let i = 1; i < recent.length; i++) {
    returns.push(Math.log(recent[i] / recent[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const vol = stdDev * Math.sqrt(365) * 100;

  return Math.round(vol * 10) / 10;
}

function estimateExchangeDepletion(vol) {
  const depletionScore = Math.max(0, 1 - vol / 150);
  return Math.round(depletionScore * 100) / 100;
}

function estimateCycleTiming() {
  const athDate = new Date("2025-10-06T00:00:00Z");
  const now = new Date();
  const daysInBear = Math.floor((now - athDate) / (1000 * 60 * 60 * 24));
  const bearDuration = (365 * 13) / 12; // ~397 days

  return { daysInBear, bearDuration };
}

// ============================================================================
// SCORING & ZONE CLASSIFICATION
// ============================================================================

function scoreBuyZone(price, mvrvZ, asorp, exDepletion, daysInBear, bearDuration) {
  const scores = {};

  // MVRV (35%)
  let mvrvScore;
  if (mvrvZ < 1.0) mvrvScore = 100;
  else if (mvrvZ < 1.5) mvrvScore = 85;
  else if (mvrvZ < 2.0) mvrvScore = 65;
  else if (mvrvZ < 3.0) mvrvScore = 35;
  else mvrvScore = 10;
  scores.mvrv = { score: mvrvScore, weight: 0.35 };

  // aSORP (25%)
  let asrpScore;
  if (asorp < 0.95) asrpScore = 100;
  else if (asorp < 1.0) asrpScore = 85;
  else if (asorp < 1.05) asrpScore = 50;
  else asrpScore = 20;
  scores.asorp = { score: asrpScore, weight: 0.25 };

  // Exchange Depletion (20%)
  const exScore = Math.round(exDepletion * 100);
  scores.ex = { score: exScore, weight: 0.2 };

  // Cycle Timing (20%)
  let timingScore;
  if (daysInBear < 200) timingScore = 25;
  else if (daysInBear < 300) timingScore = 60;
  else if (daysInBear < 420) timingScore = 100;
  else if (daysInBear < 500) timingScore = 75;
  else timingScore = 40;
  scores.timing = { score: timingScore, weight: 0.2 };

  const composite = Object.values(scores).reduce((sum, s) => sum + s.score * s.weight, 0);

  // Hard ceiling
  if (price > 70000) {
    return {
      zone: "⚪ NOT READY",
      score: Math.min(composite, 20),
      reasoning: `Price $${price.toLocaleString("en-US", { maximumFractionDigits: 0 })} > $70k hard ceiling`
    };
  }

  // Zone classification
  let zone, reason;
  if (composite >= 75 && price < 50000) {
    zone = "🟢 BEST BUY";
    reason = "Peak accumulation window";
  } else if (composite >= 50 && price >= 50000 && price < 65000) {
    zone = "🟡 BETTER BUY";
    reason = "Strong entry, monitor for deeper";
  } else if (composite >= 30 && price >= 65000 && price < 70000) {
    zone = "🔵 GOOD BUY";
    reason = "Viable but not peak. Patience recommended";
  } else {
    zone = "⚪ NOT READY";
    reason = "Wait for better entry";
  }

  // Build reasoning
  const reasons = [];
  if (mvrvZ < 1.5) reasons.push(`MVRV ${mvrvZ} (near capitulation)`);
  if (asorp < 1.0) reasons.push(`aSORP ${asorp} (loss-selling phase)`);
  if (exDepletion > 0.6) reasons.push(`Exchange depletion ${Math.round(exDepletion * 100)}%`);
  if (daysInBear >= 300 && daysInBear <= 420) reasons.push(`Optimal cycle window (${daysInBear}d)`);

  const reasoning = reasons.length > 0 ? reasons.join(" | ") : `Score ${Math.round(composite)}/100`;

  return { zone, score: Math.round(composite), reasoning };
}

function estimateCycleBottom(price, mvrvZ, daysInBear, bearDuration) {
  const ath = 126000;
  const bottom60pct = ath * 0.4; // $50.4k

  let bottomMvrv, confidence;

  if (mvrvZ < 1.0) {
    bottomMvrv = Math.min(price * 0.95, bottom60pct);
    confidence = "HIGH - Capitulation + optimal timing";
  } else if (mvrvZ < 1.5) {
    bottomMvrv = price * 0.85;
    confidence = "MEDIUM-HIGH - Near confirmed bottom";
  } else if (mvrvZ < 2.0) {
    bottomMvrv = price * 0.75;
    confidence = "MEDIUM - Optimal cycle window";
  } else {
    bottomMvrv = bottom60pct;
    confidence = "MEDIUM - Early phase, further downside likely";
  }

  let timeAdj;
  if (daysInBear < 250) timeAdj = 0.85;
  else if (daysInBear >= 300 && daysInBear <= 420) timeAdj = 1.0;
  else timeAdj = 1.05;

  const finalBottom = (bottomMvrv * 0.6 + bottom60pct * 0.4) * timeAdj;

  return {
    bottom: Math.round(finalBottom),
    confidence
  };
}

// ============================================================================
// REPORTING
// ============================================================================

async function generateReport() {
  const reportLines = [];

  reportLines.push("\n" + "=".repeat(72));
  reportLines.push(" BTC CYCLE BOTTOM MONITOR - BI-WEEKLY REPORT");
  reportLines.push("=".repeat(72));
  reportLines.push(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC\n`);

  // Fetch data
  reportLines.push("📊 Fetching live market data...");
  const price = await fetchBtcPrice();

  if (!price) {
    reportLines.push("❌ Unable to fetch price. Exiting.\n");
    console.log(reportLines.join("\n"));
    process.exit(1);
  }

  const data = await fetchBtcOhlc(90);
  if (!data) {
    reportLines.push("❌ Unable to fetch historical data. Exiting.\n");
    console.log(reportLines.join("\n"));
    process.exit(1);
  }

  const closes = data.allCloses;

  // Calculate metrics
  const mvrvZ = estimateMvrvZscore(price);
  const asorp = estimateAsorp(closes);
  const vol = estimateVolatility(closes);
  const exDepletion = estimateExchangeDepletion(vol);
  const { daysInBear, bearDuration } = estimateCycleTiming();

  reportLines.push("✅ Data retrieved\n");

  // Display metrics
  reportLines.push("📈 CURRENT METRICS:");
  reportLines.push(`  Price:                $${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  reportLines.push(
    `  90d High/Low:         $${data.high90d.toLocaleString("en-US", { maximumFractionDigits: 0 })} / $${data.low90d.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  );
  reportLines.push(`  MVRV Z-Score (proxy): ${mvrvZ}`);
  reportLines.push(`  aSORP (7d MA ratio):  ${asorp}`);
  reportLines.push(`  30d Volatility:       ${vol}% (annualized)`);
  reportLines.push(`  Exchange Depletion:   ${exDepletion} score`);
  reportLines.push(`  Days from ATH:        ${daysInBear}d (bear phase ~${Math.round(bearDuration)}d expected)`);
  reportLines.push("");

  // Score buy zone
  const { zone, score, reasoning } = scoreBuyZone(price, mvrvZ, asorp, exDepletion, daysInBear, bearDuration);

  reportLines.push("🎯 BUY ZONE:");
  reportLines.push(`  Classification:       ${zone}`);
  reportLines.push(`  Composite Score:      ${score}/100`);
  reportLines.push(`  Reasoning:            ${reasoning}`);
  reportLines.push("");

  // Estimate bottom
  const { bottom, confidence } = estimateCycleBottom(price, mvrvZ, daysInBear, bearDuration);

  reportLines.push("🔮 CYCLE BOTTOM ESTIMATE:");
  reportLines.push(`  Predicted Low:        $${bottom.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  reportLines.push(`  Downside from here:   ${((bottom / price - 1) * 100).toFixed(1)}%`);
  reportLines.push(`  Confidence:           ${confidence}`);
  reportLines.push("");

  // Summary
  reportLines.push("💡 SUMMARY:");
  let action;
  if (zone === "🟢 BEST BUY") {
    action = "This is the accumulation zone. High conviction entry.";
  } else if (zone === "🟡 BETTER BUY") {
    action = "Good entry point. Monitor for further compression.";
  } else if (zone === "🔵 GOOD BUY") {
    action = "Viable entry. Better prices likely within 4-8 weeks.";
  } else {
    action = "WAIT. Price or metrics not yet favorable. Return when zone improves.";
  }
  reportLines.push(`  ${action}\n`);

  reportLines.push("=".repeat(72));
  const nextCheck = new Date();
  nextCheck.setDate(nextCheck.getDate() + 3.5);
  reportLines.push(
    `Next check: ${nextCheck.toISOString().split("T")[0]}\n`
  );

  const report = reportLines.join("\n");
  console.log(report);

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

generateReport().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
