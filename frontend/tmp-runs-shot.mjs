import { chromium } from 'playwright'
const out = 'C:/Users/Ahmad/AppData/Local/Temp/claude/9c90ab17d5125626/0f251fa4-0538-415a-b098-e907ba2fbba5/scratchpad/runs-'
const BASE = 'http://127.0.0.1:5184'
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
async function newPage(w) {
  const page = await browser.newPage({ viewport: { width: w, height: w > 500 ? 950 : 860 } })
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  await page.addInitScript(() => { localStorage.setItem('pulp.account', '74916'); sessionStorage.setItem('pulp-intro-seen', '1') })
  return page
}
// 1. make some runs through the panel
const p = await newPage(1440)
await p.goto(BASE + '/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Talk to Pulp' }).click()
for (const msg of ['I might lose my job', 'hey pulp']) {
  await p.getByRole('textbox', { name: 'Message Pulp' }).fill(msg)
  await p.keyboard.press('Enter')
  await p.waitForFunction(() => !document.querySelector('#pulp-panel input[aria-label="Message Pulp"]')?.disabled, null, { timeout: 120000 })
  await p.waitForTimeout(800)
}
await p.getByRole('button', { name: 'Shuffle' }).first().click()
await p.waitForFunction(() => !document.querySelector('#pulp-panel input[aria-label="Message Pulp"]')?.disabled, null, { timeout: 120000 })
await p.close()

for (const w of [1440, 390]) {
  const page = await newPage(w)
  await page.goto(BASE + '/agents', { waitUntil: 'networkidle' })
  const sec = page.locator('#run-replay')
  await sec.scrollIntoViewIfNeeded()
  await page.locator('.run-list').waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  await sec.screenshot({ path: `${out}list-${w}.png` })
  // a conversation turn, mid-replay
  await page.getByRole('button', { name: 'Replay run: I might lose my job' }).first().click()
  await page.locator('.run-open').waitFor()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Play relay' }).click()
  await page.waitForTimeout(w > 500 ? 9000 : 7000)
  await page.locator('.run-open').screenshot({ path: `${out}turn-${w}.png` })
  const url = page.url()
  const step = await page.locator('.run-scrub span').textContent()
  // the Stage 1 run, via the deep link, technical log
  await page.goto(BASE + '/agents?run=stage1', { waitUntil: 'networkidle' })
  await page.locator('.run-open').waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'Technical' }).first().click()
  await page.locator('.run-log-line').nth(5).click()
  await page.locator('.run-log-more').first().click()
  await page.waitForTimeout(600)
  await page.locator('.run-open').screenshot({ path: `${out}stage1-${w}.png` })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log(w, 'deep link', url.includes('run='), 'mid-replay', step, 'overflow', overflow)
  await page.close()
}
console.log('errors', errors.length, errors.slice(0, 3))
await browser.close()
