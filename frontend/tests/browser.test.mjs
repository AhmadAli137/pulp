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

// The header's one account chip: "Account 90114, Claire" to screen readers, or "Pick an account" when none is loaded.
function accountChip(p) {
  return p.getByRole('banner').getByRole('button', { name: /^(Account \d+|Pick an account|Loading account)/ })
}

// The chip opens a small menu: Profile, the demo account ID field (to switch) and sign out.
async function openAccountMenu(p) {
  const chip = accountChip(p)
  if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click()
  const menu = p.getByRole('dialog', { name: 'Account', exact: true })
  await menu.waitFor()
  return menu
}

// The empty state ("Pick an account to begin"), which carries its own demo account ID field.
function picker(p) {
  return p.getByRole('main').getByRole('region', { name: 'Pick an account to begin', exact: true })
}

function pickerFieldFocused(p) {
  return p.waitForFunction(() => document.activeElement?.id === 'picker-account-id')
}

async function loadAccount(p, id) {
  const chip = accountChip(p)
  await chip.waitFor()
  let form
  if ((await chip.textContent()).trim() === 'Pick an account' && await picker(p).waitFor({ timeout: 15000 }).then(() => true, () => false)) {
    // Signed out on a page with the empty state: the chip leads to its ID field rather than opening a second form.
    await chip.click()
    await pickerFieldFocused(p)
    assert.equal(await p.getByRole('dialog', { name: 'Account', exact: true }).count(), 0)
    form = picker(p)
  } else {
    form = await openAccountMenu(p)
  }
  await form.getByRole('textbox', { name: 'Demo account' }).fill(String(id))
  await form.getByRole('button', { name: 'Load account', exact: true }).click()
  await p.getByRole('banner').getByRole('button', { name: new RegExp(`^Account ${id}\\b`) }).waitFor()
}

// The chip shows "<id>" or "<id> · <first name>" and is named "Account <id>" or "Account <id>, <first name>".
// Reads the visible text (not textContent, which would run the avatar's initials into the ID) and the accessible name.
async function chipShows(p, id) {
  const chip = accountChip(p)
  assert.match(await chip.locator('.bank-account-chip-text').innerText(), new RegExp(`^${id}(\\s·\\s\\S.*)?$`, 'u'))
  assert.match(await chip.getAttribute('aria-label') ?? '', new RegExp(`^Account ${id}(, \\S.*)?$`, 'u'))
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

  // With no account loaded the ID field sits in the empty state, usable straight away; the header shows one chip.
  assert.equal((await accountChip(p).textContent()).trim(), 'Pick an account')
  await p.getByRole('main').getByRole('textbox', { name: 'Demo account' }).fill(String(account))
  await p.getByRole('main').getByRole('button', { name: 'Load account', exact: true }).click()
  const heading = p.getByRole('heading', { name: `Account ${account}`, exact: true })
  await heading.waitFor()
  await p.getByRole('link', { name: 'Run a shock', exact: true }).waitFor()
  await p.getByRole('link', { name: 'View my plan', exact: true }).waitFor()
  await chipShows(p, account)
  // The header is calm: no ID box, Load button or sign-out button until the chip is opened.
  assert.equal(await p.getByRole('banner').getByRole('textbox').count(), 0)
  assert.equal(await p.getByRole('button', { name: 'Sign out of demo', exact: true }).count(), 0)
  await p.reload()
  await heading.waitFor()
  await chipShows(p, account)
  // The chip reads as "Account <id>, <first name>" (no "middle dot"), and points at its menu only while it is open.
  await p.getByRole('banner').getByRole('button', { name: new RegExp(`^Account ${account}, \\p{L}`, 'u') }).waitFor()
  assert.equal(await accountChip(p).getAttribute('aria-haspopup'), 'dialog')
  assert.equal(await accountChip(p).getAttribute('aria-controls'), null)
  const menu = await openAccountMenu(p)
  assert.equal(await accountChip(p).getAttribute('aria-controls'), 'account-menu')
  // The current account is shown above the switch field; the field starts empty, ready for another ID.
  await menu.getByText(`Account ${account}`, { exact: true }).waitFor()
  const field = menu.getByRole('textbox', { name: 'Demo account' })
  assert.equal(await field.inputValue(), '')
  assert.equal(await field.getAttribute('placeholder'), 'Another account ID')
  await p.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  assert.ok(await accountChip(p).evaluate(el => el === document.activeElement), 'Escape returns focus to the chip')
  // Tabbing past the last item closes the menu, so it never covers the page once focus has left it.
  await openAccountMenu(p)
  await menu.getByRole('button', { name: 'Sign out of demo', exact: true }).focus()
  await p.keyboard.press('Tab')
  await menu.waitFor({ state: 'detached' })

  // An account whose profile has no persona is named by its ID alone, with no stray separator or name.
  const q = await pageFor(t)
  await q.route(`**/api/profile/${account}`, async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), persona: null } })
  })
  await q.goto(base)
  await loadAccount(q, account)
  await q.waitForFunction(() => {
    const chip = document.querySelector('.bank-account-chip')
    return chip && !chip.classList.contains('is-pending')
  })
  await q.getByRole('banner').getByRole('button', { name: `Account ${account}`, exact: true }).waitFor()
  assert.equal(await accountChip(q).getAttribute('aria-label'), `Account ${account}`)
  assert.equal((await accountChip(q).locator('.bank-account-chip-text').innerText()).trim(), String(account))
  await chipShows(q, account)
})

test('combined shock shows matching cash and both plans, with a meaningful wait-or-pay decision', async t => {
  const p = await pageFor(t)
  // The Shocks page also prefetches the dealer's picks and runs the plan search, so give each wait more headroom.
  p.setDefaultTimeout(60000)
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

  await p.getByText('Can a purchase wait? Compare paying now with waiting', { exact: true }).click()
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

  // Once the shock has happened, the backup plan comes first. Both official plans live on Shocks only.
  await p.getByRole('checkbox', { name: 'This shock has already happened' }).check()
  const plans = p.getByRole('region', { name: 'The numbers behind this shock', exact: true })
  await plans.getByRole('heading', { name: 'Prepare now', exact: true }).waitFor()
  assert.deepEqual(await plans.getByRole('heading').allTextContents(), ['The numbers behind this shock', 'If it happens', 'Prepare now'])
  // Shocks shows the damage and hands over to My Plan; it does not repeat My Plan's steps.
  assert.equal(await p.getByRole('heading', { name: 'What could you do about it?', exact: true }).count(), 0)
  // One hand-off to My Plan, after both the numbers and the cash chart (whichever comes first), never in between.
  const handoff = p.getByRole('link', { name: 'What should I do? See My Plan', exact: true })
  await handoff.waitFor()
  assert.equal(await handoff.count(), 1)
  assert.equal(await plans.getByRole('link', { name: 'What should I do? See My Plan', exact: true }).count(), 0)
  assert.ok(await handoff.evaluate((link) => {
    const after = (el) => !!el && Boolean(el.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING)
    const chart = [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'Cash over time')
    return after(document.getElementById('resilience-plans')) && after(chart)
  }), 'the hand-off comes after the numbers and the cash chart')
  // My Plan opens with what to do, and does not repeat the two tables; one link leads back to them.
  await navigation(p).getByRole('link', { name: 'My Plan', exact: true }).click()
  // The tab's question is its h1, under a small "My Plan" eyebrow, and one answer sentence comes straight after it.
  await p.getByRole('heading', { name: 'What should I do?', exact: true, level: 1 }).waitFor()
  assert.equal(await p.getByRole('heading', { name: 'What should I do?', exact: true }).count(), 1, 'The question is asked once on My Plan')
  await p.locator('.bank-page-eyebrow').filter({ hasText: 'My Plan' }).waitFor()
  assert.equal(await plans.count(), 0, 'My Plan does not repeat Prepare now / If it happens')
  assert.equal(await p.getByRole('heading', { name: 'Prepare now', exact: true }).count(), 0)
  assert.equal(await p.getByRole('heading', { name: 'If it happens', exact: true }).count(), 0)
  await p.getByRole('link', { name: 'See the numbers behind this shock', exact: true }).click()
  await p.getByRole('heading', { name: 'What if life happens?', level: 1 }).waitFor()
  assert.equal(new URL(p.url()).pathname, '/shock')
  await plans.getByRole('heading', { name: 'If it happens', exact: true }).waitFor()
  await plans.getByRole('heading', { name: 'Prepare now', exact: true }).waitFor()
  // The link lands on the numbers: the section is scrolled into view (smooth scrolling may take a moment).
  await p.waitForFunction(() => {
    const r = document.getElementById('resilience-plans')?.getBoundingClientRect()
    return !!r && r.top < innerHeight && r.bottom > 0 && r.top >= -1
  }, null, { timeout: 5000 })

  await navigation(p).getByRole('link', { name: 'Shocks', exact: true }).click()
  await p.getByLabel(/^Duration/).fill('8')
  await p.getByText('Run the shock to update your results and both plans.', { exact: true }).waitFor()
  assert.equal(await p.getByRole('heading', { name: 'Cash over time', exact: true }).count(), 0)
})

test('twist cards start face down, a reveal applies the official scenario, and each reveal brings a new character', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  await p.getByRole('heading', { name: `Account ${account}`, exact: true }).waitFor()
  await navigation(p).getByRole('link', { name: 'Shocks', exact: true }).click()
  const cards = p.getByRole('group', { name: 'Twist cards' })
  for (let i = 1; i <= 4; i++) await cards.getByRole('button', { name: `Face-down card ${i}. Turn it over`, exact: true }).waitFor()

  const calculated = p.waitForResponse(r => new URL(r.url()).pathname === '/api/shocks/calculate' && r.request().postDataJSON()?.bills_increase === 0.15)
  await cards.getByRole('button', { name: 'Face-down card 3. Turn it over', exact: true }).click()
  const combined = cards.getByRole('button', { name: 'Layoff and bills: EI at 55% and household bills up 15% in the same month.', exact: true })
  await combined.waitFor()
  assert.equal(await p.getByLabel(/^Household bills change/).inputValue(), '15')
  assert.equal((await (await calculated).json()).applied_inputs.bills_increase, 0.15)
  const first = (await p.locator('.twist-slot-who').first().textContent())?.trim()

  await cards.getByRole('button', { name: 'Face-down card 1. Turn it over', exact: true }).click()
  await cards.getByRole('button', { name: 'Laid off: EI pays 55% of your usual income for 6 months.', exact: true }).waitFor()
  assert.equal(await p.getByLabel(/^Household bills change/).inputValue(), '0')
  const names = await p.locator('.twist-slot-who').allTextContents()
  assert.equal(names.length, 2)
  assert.notEqual(names[0].trim(), first, 'two consecutive reveals show different characters')
  await p.getByText(/^Shock Dealer · /).waitFor()

  // covering a card turns it face down again without changing the applied shock
  await combined.click()
  await cards.getByRole('button', { name: 'Face-down card 3. Turn it over', exact: true }).waitFor()
  assert.equal(await p.getByLabel(/^Income retained/).inputValue(), '55')

  // the personal deck: its real size is shown, a shuffle deals one of this life's cards into the fourth slot
  await p.locator('.deck-caption b').filter({ hasText: /^\d+ cards$/ }).waitFor()
  await p.getByRole('button', { name: 'Shuffle and deal', exact: true }).click()
  await p.locator('.twist-slot').nth(3).locator('.twist-dealt').waitFor()
  assert.equal(await cards.getByRole('button', { name: 'Face-down card 4. Turn it over', exact: true }).count(), 0)
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
  await openAccountMenu(p)
  await signOut.click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await accountHeading.waitFor()
  await chipShows(p, account)
  // Cancel hands focus back to the chip.
  await p.waitForFunction(() => document.activeElement?.classList.contains('bank-account-chip'))
  await openAccountMenu(p)
  await signOut.click()
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()

  const pickerHeading = p.getByRole('heading', { name: 'Pick an account to begin', exact: true })
  await pickerHeading.waitFor()
  // After a confirmed sign-out the next step is choosing an account, so focus lands on the empty state's ID field.
  await pickerFieldFocused(p)
  await p.reload()
  await pickerHeading.waitFor()
  assert.equal((await accountChip(p).textContent()).trim(), 'Pick an account')
  assert.equal(await p.getByRole('main').getByRole('textbox', { name: 'Demo account' }).inputValue(), '')
  assert.equal(await p.evaluate(() => localStorage.getItem('pulp.account')), null)
  // Signed out beside the empty state, the chip leads to its field instead of opening a second form.
  await accountChip(p).blur()
  await accountChip(p).click()
  await pickerFieldFocused(p)
  assert.equal(await p.getByRole('dialog', { name: 'Account', exact: true }).count(), 0)
  assert.equal(await p.getByRole('textbox', { name: 'Demo account' }).count(), 1)
  // On a page with no empty state, the chip's menu offers the ID field only: no profile link, no sign out.
  await p.getByRole('navigation', { name: 'How it works' }).getByRole('link', { name: 'Settings', exact: true }).click()
  await p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor()
  const menu = await openAccountMenu(p)
  const menuField = menu.getByRole('textbox', { name: 'Demo account' })
  assert.equal(await menuField.inputValue(), '')
  assert.equal(await p.getByRole('textbox', { name: 'Demo account' }).count(), 1)
  assert.equal(await signOut.count(), 0)
  assert.equal(await menu.getByRole('link', { name: 'Your profile' }).count(), 0)
  // An unknown ID typed here is reported here: the menu stays open with the error, and the page shows none.
  await menuField.fill('999999')
  await menu.getByRole('button', { name: 'Load account', exact: true }).click()
  await menu.getByRole('alert').filter({ hasText: /not in the dataset/i }).waitFor()
  assert.equal(await p.getByRole('main').getByRole('alert').filter({ hasText: /not in the dataset/i }).count(), 0)
  assert.equal((await accountChip(p).textContent()).trim(), 'Pick an account')
  assert.ok(await menuField.evaluate(el => el === document.activeElement), 'The field keeps focus after an unknown ID')
  // A known ID loads, then the menu closes and focus returns to the chip, which now names the account.
  await menuField.fill(String(account))
  await menu.getByRole('button', { name: 'Load account', exact: true }).click()
  await menu.waitFor({ state: 'detached' })
  await chipShows(p, account)
  await p.waitForFunction(() => document.activeElement?.classList.contains('bank-account-chip'))
})

test('invalid IDs show feedback and an unknown ID keeps the previous account', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  const heading = p.getByRole('heading', { name: `Account ${account}`, exact: true })
  await heading.waitFor()
  const menu = await openAccountMenu(p)
  const field = menu.getByRole('textbox', { name: 'Demo account' })
  const load = menu.getByRole('button', { name: 'Load account', exact: true })

  await field.fill('abc')
  await load.click()
  await p.getByRole('alert').filter({ hasText: 'Enter a valid positive account ID' }).waitFor()
  await heading.waitFor()
  await field.fill('999999')
  await load.click()
  // The error shows in the menu, where the ID was typed, and the account the user had stays loaded.
  await menu.getByRole('alert').filter({ hasText: /not in the dataset/i }).waitFor()
  await heading.waitFor()
  await chipShows(p, account)
  assert.equal(await p.evaluate(() => localStorage.getItem('pulp.account')), String(account))
})

test('main destinations fit desktop and mobile and retain the account', async t => {
  for (const width of [1440, 390]) {
    const p = await pageFor(t, { width, height: 960 })
    await p.goto(base)
    await loadAccount(p, account)
    await p.getByRole('heading', { name: `Account ${account}`, exact: true }).waitFor()
    const nav = navigation(p)
    const fits = async path => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow on ${path} at ${width}px`)
    // Exactly four tabs, one question each; no "Account tools" menu. The question is the h1, the tab name a small
    // eyebrow above it, and one answer sentence follows straight after the heading, before anything else on the page.
    const pages = [['Overview', '/', 'How am I doing?'], ['Shocks', '/shock', 'What if life happens?'], ['My Plan', '/plan', 'What should I do?'], ['Insights', '/insights', 'How do I compare?']]
    const question = Object.fromEntries(pages.map(([title, , q]) => [title, q]))
    assert.deepEqual(await nav.getByRole('link').allTextContents(), pages.map(([title]) => title))
    assert.equal(await p.getByText('Account tools', { exact: true }).count(), 0)
    for (const [title, path, q] of pages) {
      await nav.getByRole('link', { name: title, exact: true }).click()
      await p.getByRole('heading', { name: q, exact: true, level: 1 }).waitFor()
      assert.equal(await p.locator('.bank-page-eyebrow').textContent(), title)
      const answer = p.locator('main .page-answer')
      await answer.waitFor()
      // While its numbers load a tab holds the answer's place with a quiet pending line; the account's own figures follow.
      if (path === '/' || path === '/insights') await p.locator('main .page-answer:not(.is-pending)').waitFor({ timeout: 30000 })
      assert.equal(await answer.count(), 1, `One answer sentence on ${path}`)
      assert.ok(await answer.evaluate((el) => {
        const first = [...document.querySelectorAll('main *')].find((n) => n.matches('section, .card, .page-lead, .page-answer, h2'))
        return first === el
      }), `The answer comes first on ${path}`)
      if (path === '/' || path === '/insights') assert.match(await answer.textContent(), /\d/, `The answer on ${path} uses the account's numbers`)
      assert.equal(new URL(p.url()).pathname, path)
      await chipShows(p, account)
      await fits(path)
    }
    // Profile opens from the account chip's menu; there its link is marked as the current page and the chip is tinted.
    const persona = p.getByRole('banner').getByRole('link', { name: 'Your profile', exact: true })
    let menu = await openAccountMenu(p)
    await fits('the open account menu')
    assert.equal(await persona.getAttribute('aria-current'), null)
    await persona.click()
    await p.getByRole('heading', { name: 'Profile', level: 1 }).waitFor()
    assert.equal(new URL(p.url()).pathname, '/profile')
    await menu.waitFor({ state: 'detached' })
    assert.match(await accountChip(p).getAttribute('class') ?? '', /\bis-current\b/)
    await openAccountMenu(p)
    assert.equal(await persona.getAttribute('aria-current'), 'page')
    await p.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    assert.equal(await nav.locator('[aria-current]').count(), 0, 'No tab is current on Profile')
    await fits('/profile')
    // How it works lives in the footer, each page listed once across the header, tabs and footer.
    const footer = p.getByRole('navigation', { name: 'How it works' })
    const howItWorks = [['Agents', '/agents'], ['Stage 1 report', '/report'], ['Developer docs', '/developers'], ['Settings', '/settings']]
    assert.deepEqual(await footer.getByRole('link').allTextContents(), howItWorks.map(([title]) => title))
    for (const [title, path] of howItWorks) {
      await footer.getByRole('link', { name: title, exact: true }).click()
      await p.getByRole('heading', { name: title, level: 1 }).waitFor()
      assert.equal(new URL(p.url()).pathname, path)
      await fits(path)
    }
    const everyLink = [...await nav.getByRole('link').allTextContents(), ...await footer.getByRole('link').allTextContents(), 'Profile']
    assert.equal(new Set(everyLink).size, everyLink.length, 'No destination is listed twice')
    // Pages that left the menu are one link away from the tab they belong to. There, that tab stays highlighted
    // and a back link above the title returns to it. Each folded page is linked from one place only.
    const folded = [['My Plan', '/plan', 'Next steps: this week, month and year', 'Next steps', '/roadmap'],
      ['My Plan', '/plan', 'Compare ways to reach a goal', 'Goals', '/goals'],
      ['Insights', '/insights', 'Read your briefing', 'Briefings', '/briefings']]
    for (const [tab, tabPath, link, title, path] of folded) {
      await nav.getByRole('link', { name: tab, exact: true }).click()
      await p.getByRole('heading', { name: question[tab], level: 1 }).waitFor()
      await p.getByRole('link', { name: link, exact: true }).click()
      await p.getByRole('heading', { name: title, level: 1 }).waitFor()
      assert.equal(new URL(p.url()).pathname, path)
      assert.equal(await nav.getByRole('link', { name: tab, exact: true }).getAttribute('aria-current'), 'true', `${tab} stays highlighted on ${path}`)
      assert.equal(await nav.locator('[aria-current]').count(), 1, `Only ${tab} is highlighted on ${path}`)
      await fits(path)
      await p.getByRole('main').getByRole('link', { name: `Back to ${tab}`, exact: true }).click()
      await p.getByRole('heading', { name: question[tab], level: 1 }).waitFor()
      assert.equal(new URL(p.url()).pathname, tabPath)
    }
    // Account details belongs to Profile: linked from there, the account chip is highlighted, and it points back.
    await openAccountMenu(p)
    await persona.click()
    await p.getByRole('heading', { name: 'Profile', level: 1 }).waitFor()
    assert.equal(await p.getByRole('link', { name: 'Compare ways to reach a goal', exact: true }).count(), 0, 'Goals is linked from My Plan only')
    await p.getByRole('link', { name: 'Review account details and balances', exact: true }).click()
    await p.getByRole('heading', { name: 'Account details', level: 1 }).waitFor()
    assert.match(await accountChip(p).getAttribute('class') ?? '', /\bis-current\b/)
    menu = await openAccountMenu(p)
    assert.equal(await persona.getAttribute('aria-current'), 'true', 'The profile link is marked as the parent of Account details')
    await p.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    assert.equal(await nav.locator('[aria-current]').count(), 0)
    await fits('/twin')
    await p.getByRole('main').getByRole('link', { name: 'Back to Profile', exact: true }).click()
    await p.getByRole('heading', { name: 'Profile', level: 1 }).waitFor()
    await p.goto(base + '/explore')
    await p.getByRole('heading', { name: 'What if life happens?', level: 1 }).waitFor()
    assert.equal(new URL(p.url()).pathname, '/shock')
  }
})

test('the Agents page plays all three stages and the panel shows the live workflow beside the chat', async t => {
  const p = await pageFor(t)
  await p.goto(base + '/agents')
  await loadAccount(p, account)
  await p.getByRole('heading', { name: 'Agents', level: 1 }).waitFor()
  for (const title of ['From records to a person', 'Getting to know you', 'When life happens']) await p.getByRole('heading', { name: title, level: 2 }).waitFor()
  const relay = p.getByRole('group', { name: 'Stage 1 relay' })
  // The first screen is plain: key steps only. Technical mode lives in the "For the technically curious" section.
  assert.ok(await relay.getByRole('list', { name: 'Steps in order' }).getByRole('listitem').count() <= 8)
  await p.getByText('For the technically curious').click()
  await p.getByRole('button', { name: 'Technical', exact: true }).click()
  await relay.getByRole('button', { name: 'Next step' }).click()
  assert.ok(await relay.getByRole('list', { name: 'Steps in order' }).getByRole('listitem').count() >= 5)

  await p.getByRole('button', { name: 'Try it: open Pulp' }).click()
  const panel = p.getByRole('complementary', { name: 'Pulp conversation' })
  await panel.getByRole('button', { name: 'Agents', exact: true }).click()
  const workflow = panel.getByRole('region', { name: 'Agent workflow' })
  await workflow.waitFor()
  await workflow.getByRole('group', { name: "This turn's agent relay" }).waitFor({ timeout: 20000 })

  // Shuffle twice with Agents open: a plain user bubble, a short reply with a compact visual, a different card each
  // time, and the council's offline fallback labelled (the test API has no model key).
  assert.equal(await panel.getByTitle('Pick a twist card').count(), 0)
  const input = panel.getByRole('textbox', { name: 'Message Pulp' })
  const dealt = []
  for (let i = 0; i < 2; i++) {
    await input.waitFor({ state: 'visible' })
    await p.waitForFunction(() => !document.querySelector('.pulp-panel input[aria-label="Message Pulp"]').disabled, null, { timeout: 60000 })
    await panel.getByTitle('Deal a random twist').click()
    await panel.locator('.msg.user').filter({ hasText: 'Shuffle a twist' }).nth(i).waitFor()
    await panel.locator('.msg.pulp-reply').nth(i).waitFor({ timeout: 60000 })
    dealt.push(await panel.locator('.pulp-official').filter({ hasText: 'See the official numbers' }).last().textContent())
  }
  assert.notEqual(dealt[0], dealt[1], 'Two shuffles deal two different cards')
  await workflow.getByText('Offline: engine only').waitFor({ timeout: 10000 })
  assert.ok(await workflow.getByRole('group', { name: "This turn's agent relay" }).isVisible(), 'The workflow stays in view while a visual waits one tab away')

  await panel.locator('.msg.pulp-reply').last().getByRole('button', { name: /^Open the/ }).click()
  const visual = panel.getByRole('region', { name: 'Visual, larger view' })
  await visual.waitFor({ timeout: 20000 })
  assert.ok(await input.isVisible(), 'The chat stays visible beside a visual')
  await panel.getByRole('tab', { name: 'Agents' }).click()
  await workflow.waitFor()
  await panel.getByRole('tab', { name: 'Visual' }).click()
  await p.keyboard.press('Escape')
  await visual.waitFor({ state: 'hidden' })
  assert.ok(await panel.isVisible(), 'Escape closes the visual before the panel')
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))

  // Talk with a draft sends the draft as text; with nothing typed it opens voice (or explains why it cannot).
  await p.waitForFunction(() => !document.querySelector('.pulp-panel input[aria-label="Message Pulp"]').disabled, null, { timeout: 60000 })
  await input.fill('How long would my cushion last?')
  await panel.getByRole('button', { name: 'Talk: send what you typed' }).click()
  await panel.locator('.msg.user').filter({ hasText: 'How long would my cushion last?' }).waitFor()
  await p.waitForFunction(() => !document.querySelector('.pulp-panel input[aria-label="Message Pulp"]').disabled, null, { timeout: 60000 })
  await panel.getByRole('button', { name: 'Start voice conversation' }).click()
  await panel.getByRole('button', { name: 'Stop voice conversation' }).or(panel.locator('.thread-notice')).first().waitFor({ timeout: 15000 })
  if (await panel.getByRole('button', { name: 'Stop voice conversation' }).isVisible()) await panel.getByRole('button', { name: 'Stop voice conversation' }).click()

  // Every turn above was recorded: replay one step by step with its log, and the deep link survives a reload.
  await p.goto(base + '/agents')
  await p.getByRole('heading', { name: 'Replay a run', level: 2 }).waitFor()
  await p.getByRole('button', { name: 'Replay run: Shuffle a twist' }).first().click()
  const replay = p.getByRole('region', { name: 'Replay: Shuffle a twist' })
  await replay.waitFor({ timeout: 20000 })
  assert.ok(await replay.getByRole('list', { name: 'Run log' }).getByRole('listitem').count() >= 4)
  await replay.locator('.run-log-line').nth(2).click()
  await replay.getByText('Step 3 of').waitFor()
  assert.match(p.url(), /[?&]run=/)
  await p.reload()
  await p.getByRole('region', { name: 'Replay: Shuffle a twist' }).waitFor({ timeout: 20000 })
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

  await p.getByRole('navigation', { name: 'How it works' }).getByRole('link', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Replay intro', exact: true }).click()
  await intro.getByRole('button', { name: /^Skip/ }).click()
  await intro.waitFor({ state: 'hidden' })
  await p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor()
})

test('account details drop the decisions block that Insights keeps, and findings pair cups with charts', async t => {
  const p = await pageFor(t, { width: 390, height: 844 })
  await p.goto(base + '/twin')
  await loadAccount(p, account)
  await p.getByRole('region', { name: 'Your account context' }).waitFor()
  const update = p.getByRole('button', { name: 'Update balances', exact: true })
  await update.waitFor()
  assert.equal(await p.getByRole('region', { name: 'Insights for your decisions' }).count(), 0)
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))

  await p.goto(base + '/insights')
  await p.getByRole('region', { name: 'Insights for your decisions' }).waitFor()
  const quartiles = p.getByRole('group', { name: 'Six-month survival by quartile: view' })
  await quartiles.waitFor()
  await p.getByRole('img', { name: 'Q4 (highest): 25%' }).waitFor()
  assert.ok(await p.locator('.prov-recorded').count() > 0 && await p.locator('.prov-simulated').count() > 0)
  await quartiles.getByRole('button', { name: 'Detailed', exact: true }).click()
  await p.getByRole('region', { name: 'Share lasting six months, by quartile' }).waitFor()
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
})

test('Simple view tucks detail away, Profile opens on tabs, and Explain this answers in the chat', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await loadAccount(p, account)
  await p.getByRole('heading', { name: `Account ${account}`, exact: true }).waitFor()
  const views = p.getByRole('group', { name: 'How much to show' })
  assert.equal(await views.getByRole('button', { name: 'Simple', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await p.getByRole('heading', { name: /Cash buffer/ }).count(), 0)
  await p.getByRole('button', { name: 'Show full detail' }).click()
  await p.getByRole('heading', { name: /Cash buffer/ }).waitFor()

  await (await openAccountMenu(p)).getByRole('link', { name: 'Your profile', exact: true }).click()
  const tabs = p.getByRole('tablist', { name: 'Profile sections' })
  for (const name of ['Goals', 'Worries & questions', 'How you compare', 'History']) await tabs.getByRole('tab', { name, exact: true }).waitFor()
  await tabs.getByRole('tab', { name: 'History', exact: true }).click()
  await p.getByRole('heading', { name: 'How PULP’s picture of you changed' }).waitFor()
  assert.ok(new URL(p.url()).searchParams.get('tab') === 'history')

  await navigation(p).getByRole('link', { name: 'Overview', exact: true }).click()
  await p.getByRole('button', { name: 'Explain: your typical month' }).click()
  const panel = p.getByRole('complementary', { name: 'Pulp conversation' })
  await panel.locator('.msg.user').filter({ hasText: 'Explain: your typical month' }).waitFor()
  await panel.locator('.msg.pulp-reply, .msg.pulp').filter({ hasText: /bathtub/ }).first().waitFor({ timeout: 30000 })
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
})

test('developer docs list every endpoint group and fit a phone', async t => {
  const p = await pageFor(t, { width: 390, height: 844 })
  await p.goto(base + '/developers')
  await p.getByRole('heading', { name: 'Developer docs', level: 1 }).waitFor()
  await p.getByRole('img', { name: /How PULP's agents hand work to each other/ }).waitFor()
  const plans = p.locator('#api-plans')
  await plans.getByText('/api/agent/life-plans', { exact: true }).first().waitFor()
  await p.getByRole('combobox', { name: 'On this page' }).waitFor()
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
})
