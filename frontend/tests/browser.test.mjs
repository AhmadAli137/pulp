import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:8002'
const account = 90114
const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

let server, browser
before(async () => {
  // The test server uses temporary storage. Refuse to reuse a developer's API.
  try { await fetch(`${base}/api/health`); throw new Error('Port 8002 is occupied') }
  catch (e) { if (e.message === 'Port 8002 is occupied') throw e }

  server = spawn('python', ['../backend/scripts/browser_test_server.py'], { stdio: 'inherit', windowsHide: true })
  let ready = false
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(`Test API exited with code ${server.exitCode}`)
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'The test API did not start. Activate the Python environment and install the backend requirements.')
  const executablePath = process.env.PULP_BROWSER_EXECUTABLE
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : { channel: process.env.PULP_BROWSER_CHANNEL || 'chrome' }),
    headless: true,
  })
})
after(async () => { await browser?.close(); server?.kill() })

async function pageFor(t, viewport = { width: 1440, height: 960 }, skipIntro = true) {
  const context = await browser.newContext({ viewport })
  t.after(() => context.close())
  if (skipIntro) await context.addInitScript(() => sessionStorage.setItem('pulp-intro-seen', '1'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  t.after(() => assert.deepEqual(errors, []))
  return page
}

function navigation(p) {
  return p.getByRole('navigation', { name: 'Main navigation' })
}

async function loadAccount(p, id) {
  await p.getByRole('textbox', { name: 'Demo account' }).fill(String(id))
  await p.getByRole('button', { name: 'Load account', exact: true }).click()
  await p.getByRole('button', { name: 'Sign out of demo', exact: true }).waitFor()
}

function postTo(p, path) {
  return p.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST')
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `Expected ${actual} to equal ${expected}`)
}

test('an unfamiliar account can be loaded by ID and survives a reload', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await p.getByRole('heading', { name: 'Pick an account to begin', exact: true }).waitFor()
  const samples = await (await p.request.get(`${base}/api/accounts/sample`)).json()
  assert.ok(samples.accounts.every(({ account_id }) => account_id !== account))

  await loadAccount(p, account)
  const heading = p.getByRole('heading', { name: `Account ${account}`, exact: true })
  await heading.waitFor()
  await p.getByRole('link', { name: 'Run a shock', exact: true }).waitFor()
  await p.getByRole('link', { name: 'View my plan', exact: true }).waitFor()
  await p.reload()
  await heading.waitFor()
  assert.equal(await p.getByRole('textbox', { name: 'Demo account' }).inputValue(), String(account))
})

test('combined shock shows matching cash and both plans, with a meaningful wait-or-pay decision', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  await p.getByRole('heading', { name: `Account ${account}`, exact: true }).waitFor()
  await navigation(p).getByRole('link', { name: 'Shocks', exact: true }).click()

  // Independently transcribed from monthly_summary.csv: all-history medians and last-six-month mean.
  const usualIncome = 2706.86
  const usualSpending = 1771.15
  const usualHouseholdBills = 1447.32
  const cash = 4086.788333333333
  const upfrontCost = 600
  const purchaseCost = 1500
  const months = 6
  const gap = usualSpending + 0.15 * usualHouseholdBills - 0.55 * usualIncome
  const cashAfterShock = cash - upfrontCost - gap * months
  const baselineCash = cash + (usualIncome - usualSpending) * months

  await p.getByLabel(/^Income retained/).fill('55')
  await p.getByLabel(/^Household bills change/).fill('15')
  await p.getByLabel(/^One-time cost/).fill(String(upfrontCost))
  await p.getByLabel(/^Duration/).fill(String(months))
  const calculated = postTo(p, '/api/shocks/calculate')
  await p.getByRole('button', { name: 'Run shock', exact: true }).click()
  const result = await calculated
  assert.equal(result.status(), 200)
  const report = await result.json()
  assert.equal(report.account_id, account)
  closeTo(report.shocked.buffer_left, cash - upfrontCost)
  closeTo(report.shocked.monthly_gap, gap)
  closeTo(report.verdict.cash_left_at_horizon, cashAfterShock)
  const finalPoint = report.cash_path.at(-1)
  assert.equal(finalPoint.month, months)
  closeTo(finalPoint.baseline, baselineCash)
  closeTo(finalPoint.after_shock, cashAfterShock)

  await p.getByRole('heading', { name: 'Cash over time', exact: true }).waitFor()
  const plot = p.locator('.scenario-chart .recharts-wrapper')
  await plot.waitFor({ state: 'visible' })
  await plot.locator('.recharts-line-curve').last().waitFor({ state: 'visible' })
  const plotBounds = await plot.boundingBox()
  assert.ok(plotBounds?.width > 200 && plotBounds.height > 100, 'The cash plot has usable dimensions')
  assert.equal(await plot.locator('.recharts-line-curve').count(), 2)
  await p.getByRole('heading', { name: 'Prepare now', exact: true }).waitFor()
  await p.getByRole('heading', { name: 'If it happens', exact: true }).waitFor()
  await p.getByText('View exact amounts', { exact: true }).click()
  const finalRow = p.getByRole('table', { name: 'Cash over time', exact: true }).getByRole('row').last()
  await finalRow.getByRole('cell', { name: money.format(baselineCash), exact: true }).waitFor()
  await finalRow.getByRole('cell', { name: money.format(cashAfterShock), exact: true }).waitFor()

  const purchase = p.getByLabel(/^Remaining optional cost/)
  await purchase.fill(String(purchaseCost))
  const compared = postTo(p, '/api/shocks/compare-purchase')
  await p.getByRole('button', { name: 'Compare options', exact: true }).click()
  const comparison = await compared
  assert.equal(comparison.status(), 200)
  const options = await comparison.json()
  closeTo(options.wait.verdict.cash_left_at_horizon, cashAfterShock)
  closeTo(options.buy.verdict.cash_left_at_horizon, cashAfterShock - purchaseCost)
  assert.equal(options.recommendation, 'wait')
  const choiceTable = p.getByRole('table', { name: 'Wait or pay now' })
  await choiceTable.getByRole('columnheader', { name: 'Wait', exact: true }).waitFor()
  await choiceTable.getByRole('columnheader', { name: 'Pay now', exact: true }).waitFor()
  await choiceTable.getByRole('row', { name: 'Shortfall over 6 months $0.00 $1,010.06' }).waitFor()
  await p.getByRole('heading', { name: 'Wait on the purchase', exact: true }).waitFor()

  await p.getByRole('checkbox', { name: 'This shock has already happened' }).check()
  await navigation(p).getByRole('link', { name: 'My Plan', exact: true }).click()
  await p.getByRole('heading', { name: 'My Plan', exact: true }).waitFor()
  const plans = p.getByRole('region', { name: 'Resilience plans' })
  await plans.getByRole('heading', { name: 'Prepare now', exact: true }).waitFor()
  assert.deepEqual(await plans.getByRole('heading').allTextContents(), ['If it happens', 'Prepare now'])

  await navigation(p).getByRole('link', { name: 'Shocks', exact: true }).click()
  await p.getByLabel(/^Duration/).fill('8')
  await p.getByText('Run the shock to update your results and both plans.', { exact: true }).waitFor()
  assert.equal(await p.getByRole('heading', { name: 'Cash over time', exact: true }).count(), 0)
})

test('Insights distinguishes the home and branch records and labels modeled research', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  const request = p.waitForRequest(req => {
    const url = new URL(req.url())
    return url.pathname === `/api/customers/${account}/insights`
  })
  await navigation(p).getByRole('link', { name: 'Insights', exact: true }).click()
  assert.equal(new URL((await request).url()).searchParams.get('use_ai'), 'false')

  const context = p.getByRole('region', { name: 'Your account context' })
  await context.getByText('Chrudim', { exact: true }).waitFor()
  await context.getByText('Domazlice', { exact: true }).waitFor()
  assert.deepEqual(await context.locator('dl').first().locator('dt, dd').allTextContents().then(values => values.slice(0, 4)),
    ['Owner’s home district', 'Chrudim', 'Account branch district', 'Domazlice'])
  const evidence = p.getByRole('region', { name: 'Insights for your decisions' })
  await evidence.getByText(/Monthly account summaries · \d{4}-\d{2} to \d{4}-\d{2}/).first().waitFor()
  const study = p.getByRole('region', { name: 'More cash can still run out sooner' })
  await study.getByText(/78 of 2,238/).waitFor()
  await study.getByText('Simulated · Research finding', { exact: true }).waitFor()
})

test('sign-out asks for confirmation and clears account restoration after refresh', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  const accountHeading = p.getByRole('heading', { name: `Account ${account}`, exact: true })
  await accountHeading.waitFor()
  const signOut = p.getByRole('button', { name: 'Sign out of demo', exact: true })
  const dialog = p.getByRole('dialog', { name: 'Sign out of demo?' })
  await signOut.click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await accountHeading.waitFor()
  await signOut.click()
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()

  const picker = p.getByRole('heading', { name: 'Pick an account to begin', exact: true })
  await picker.waitFor()
  await p.reload()
  await picker.waitFor()
  assert.equal(await p.getByRole('textbox', { name: 'Demo account' }).inputValue(), '')
  assert.equal(await p.evaluate(() => localStorage.getItem('pulp.account')), null)
  assert.equal(await signOut.count(), 0)
})

test('invalid IDs show feedback and unknown IDs clear the previous account', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  const heading = p.getByRole('heading', { name: `Account ${account}`, exact: true })
  await heading.waitFor()
  const field = p.getByRole('textbox', { name: 'Demo account' })
  const load = p.getByRole('button', { name: 'Load account', exact: true })

  await field.fill('abc')
  await load.click()
  await p.getByRole('alert').filter({ hasText: 'Enter a valid positive account ID' }).waitFor()
  await heading.waitFor()
  await field.fill('999999')
  await load.click()
  await p.getByRole('alert').filter({ hasText: /not in the dataset/i }).waitFor()
  assert.equal(await heading.count(), 0)
})

test('main destinations fit desktop and mobile and retain the account', async t => {
  for (const width of [1440, 390]) {
    const p = await pageFor(t, { width, height: 960 })
    await p.goto(base)
    await loadAccount(p, account)
    await p.getByRole('heading', { name: `Account ${account}`, exact: true }).waitFor()
    const nav = navigation(p)
    const pages = [['Overview', '/'], ['Shocks', '/shock'], ['My Plan', '/plan'], ['Insights', '/insights']]
    assert.deepEqual(await nav.getByRole('link').allTextContents(), pages.map(([title]) => title))
    for (const [title, path] of pages) {
      await nav.getByRole('link', { name: title, exact: true }).click()
      await p.getByRole('heading', { name: title, level: 1 }).waitFor()
      assert.equal(new URL(p.url()).pathname, path)
      assert.equal(await p.getByRole('textbox', { name: 'Demo account' }).inputValue(), String(account))
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow on ${path} at ${width}px`)
    }
    await p.goto(base + '/explore')
    await p.getByRole('heading', { name: 'Shocks', level: 1 }).waitFor()
    assert.equal(new URL(p.url()).pathname, '/shock')
  }
})

test('confirmed loan purpose can be corrected and survives a reload', async t => {
  const p = await pageFor(t, { width: 390, height: 844 })
  await p.goto(base + '/insights')
  await loadAccount(p, 20111)
  const context = p.getByRole('region', { name: 'Your account context' })
  const confirmed = context.getByRole('region', { name: 'Confirmed loan purpose' })
  await context.getByText('Tell Pulp what the loan was for', { exact: true }).click()
  const purpose = context.getByLabel('What did this loan help you do?', { exact: true })
  const save = context.getByRole('button', { name: 'Save loan purpose', exact: true })
  await purpose.fill('Replace the car I needed to get to work')
  await save.click()
  await confirmed.getByText('Replace the car I needed to get to work', { exact: true }).waitFor()
  assert.equal(await context.getByText('Possible explanation · unconfirmed', { exact: true }).count(), 0)

  await p.reload()
  await confirmed.getByText('Replace the car I needed to get to work', { exact: true }).waitFor()
  await context.getByText('Correct the loan purpose', { exact: true }).click()
  await purpose.fill('An essential home repair')
  await save.click()
  await confirmed.getByText('An essential home repair', { exact: true }).waitFor()
  assert.equal(await confirmed.getByText('Replace the car I needed to get to work', { exact: true }).count(), 0)
})

test('the opening is brief and can be replayed and skipped in Settings', async t => {
  const p = await pageFor(t, undefined, false)
  await p.goto(base, { waitUntil: 'domcontentloaded' })
  const intro = p.getByRole('dialog', { name: 'PULP opening animation' })
  await intro.waitFor()
  await intro.waitFor({ state: 'hidden', timeout: 3500 })

  await p.getByText('Account tools', { exact: true }).click()
  await p.getByRole('navigation', { name: 'Account tools' }).getByRole('link', { name: 'Settings' }).click()
  await p.getByRole('button', { name: 'Replay intro', exact: true }).click()
  await intro.getByRole('button', { name: /^Skip/ }).click()
  await intro.waitFor({ state: 'hidden' })
  await p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor()
})
