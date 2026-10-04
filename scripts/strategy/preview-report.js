"use strict";
// Offline preview of real research results, without login, DB initialization,
// network requests to production, exchange calls or Telegram side effects.
const fs = require("node:fs"),
  path = require("node:path"),
  puppeteer = require("puppeteer");
async function main() {
  const root = path.resolve(__dirname, "../.."),
    research = JSON.parse(
      fs.readFileSync(path.join(root, "docs/strategy/results.json")),
    ),
    policy = require("../../config/strategy-v2.json"),
    { metrics, breakdown } = require("../../services/strategy/metrics"),
    { promotion } = require("../../services/strategy/policy");
  const data = {
    research,
    policy,
    promotion: promotion(policy, research),
    live: {
      metrics: metrics([]),
      breakdown: breakdown([]),
      accountingPending: 0,
    },
    breaker: { halted: false },
    recent: [],
  };
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 1050 });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === "/strategy-performance")
        return req.respond({
          status: 200,
          contentType: "text/html",
          body: require("../../views/strategy").getStrategyHTML(),
        });
      if (url.pathname === "/api/strategy/performance")
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      return req.respond({ status: 200, contentType: "text/plain", body: "" });
    });
    await page.goto("http://127.0.0.1/strategy-performance");
    await page.waitForFunction(() =>
      document.getElementById("status").textContent.includes("REJECTED"),
    );
    await page.screenshot({
      path: path.join(root, "docs/strategy/dashboard-preview.png"),
    });
    await page.select("#source", "history");
    await page.waitForFunction(() =>
      document.getElementById("quality").textContent.includes("47/52"),
    );
    await page.setViewport({ width: 390, height: 844 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
    )
      throw Error("MOBILE_OVERFLOW");
    await page.screenshot({
      path: path.join(root, "docs/strategy/dashboard-mobile.png"),
    });
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "PASS Strategy Performance desktop/mobile; report and historical selectors; no browser JavaScript errors.",
    );
  } finally {
    await browser.close();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
