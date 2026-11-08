import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:8002'
let server, browser
before(async () => {
  // Refuse to reuse a developer's API or mutate their context.
  try { await fetch(`${base}/api/health`); throw new Error('Port 8002 is occupied') }
  catch (e) { if (e.message === 'Port 8002 is occupied') throw e }
  server = spawn('python', ['../backend/scripts/browser_test_server.py'], { stdio: 'inherit', windowsHide: true })
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Test API exited')
    try { if ((await fetch(`${base}/api/health`)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  browser = await chromium.launch({ channel: process.env.PULP_BROWSER_CHANNEL || 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
})
after(async () => { await browser?.close(); server?.kill() })

async function pageFor(t, account = 20111, options = {}) {
  const context = await browser.newContext(options)
  t.after(() => context.close())
  await context.addInitScript(id => {
    localStorage.setItem('pulp.account', String(id))
    sessionStorage.setItem('pulp-intro-seen', '1')
  }, account)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  t.after(() => assert.deepEqual(errors, []))
  return page
}


test('home is conversation first, with an optional financial glance', async t => {
  const p = await pageFor(t); await p.goto(base)
  await p.getByRole('textbox', { name: 'Message', exact: true }).waitFor()
  await p.getByRole('button', { name: /Your money at a glance/ }).click()
  assert.equal(await p.locator('.thread-figure').count(), 1)
})

test('typed goal requires confirmation and survives reload', async t => {
  const p = await pageFor(t); await p.goto(base)
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('I want to buy a home in five years.')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await p.getByRole('button', { name: 'Confirm', exact: true }).click()
  await p.getByText(/Noted. I/).waitFor()
  const result = await (await p.request.get(`${base}/api/context/20111`)).json()
  assert.equal(result.summary.goals[0].type, 'home_purchase')
  await p.reload()
  await p.getByText('I want to buy a home in five years.', { exact: true }).waitFor()
})

test('declining context does not accept the goal', async t => {
  const p = await pageFor(t, 20133); await p.goto(base)
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('I want to move out next year.')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await p.getByRole('button', { name: 'Not quite', exact: true }).click()
  await p.getByText('Left it out.', { exact: true }).waitFor()
  const r = await (await p.request.get(`${base}/api/context/20133`)).json()
  assert.equal(r.summary.goals.length, 0)
})

test('mobile home fits and navigation reaches research', async t => {
  const p = await pageFor(t, 20111, { viewport: { width: 390, height: 844 } }); await p.goto(base)
  await p.getByRole('button', { name: 'Start voice conversation' }).waitFor()
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await p.getByRole('button', { name: 'Open navigation' }).click()
  await p.getByText('Reviews, evidence & settings', { exact: true }).click()
  await p.getByRole('button', { name: 'Insights & evidence' }).click()
  await p.getByRole('region', { name: 'Insights for your decisions' }).waitFor()
})

test('microphone denial leaves text available', async t => {
  const p = await pageFor(t)
  await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone denied') } })
  await p.goto(base)
  await p.getByRole('button', { name: 'Start voice conversation' }).click()
  await p.getByText('Microphone denied', { exact: true }).waitFor()
  assert.ok(await p.getByRole('textbox', { name: 'Message', exact: true }).isEnabled())
})

test('typing within live voice keeps the same session and never uses browser narration', { timeout: 45000 }, async t => {
  const p = await pageFor(t, 20111, { permissions: ['microphone'] })
  await p.addInitScript(() => {
    window.ttsCalls = 0
    speechSynthesis.speak = () => window.ttsCalls++
  })
  const sent = []
  await p.routeWebSocket('**/api/agent/voice/*', ws => {
    ws.send(JSON.stringify({ type: 'ready' }))
    ws.onMessage(raw => { const m = JSON.parse(raw); if (m.type === 'text') {
      sent.push(m.text)
      ws.send(JSON.stringify({ type: 'walkthrough', beats: [1, 2].map(i => ({ id: `voice-${i}`, visual: 'cards', caption: `Choice ${i}`, duration_s: 3, params: { cards: [{ key: 'furnace', title: `Choice ${i}`, text: 'Compare the choices.' }] } })) }))
      ws.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: 'We can adjust the same plan.' }))
      ws.send(JSON.stringify({ type: 'turn_complete' }))
    } })
  })
  await p.goto(base)
  await p.getByRole('button', { name: 'Start voice conversation' }).click()
  await p.getByText(/Listening/).waitFor()
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('I cannot cut rent')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await p.getByText('We can adjust the same plan.', { exact: true }).waitFor()
  const walkthrough = p.getByRole('region', { name: 'Animated walkthrough' })
  await walkthrough.getByRole('button', { name: 'Play animation sequence' }).waitFor()
  await walkthrough.getByRole('button', { name: 'Next scene' }).click()
  await walkthrough.getByText('Scene 2 of 2', { exact: true }).waitFor()
  assert.deepEqual(sent, ['I cannot cut rent'])
  assert.equal(await p.getByRole('button', { name: 'Stop voice conversation' }).count(), 1)
  assert.equal(await p.evaluate(() => window.ttsCalls), 0)
})

test('saved council result is shared by goals and roadmap after navigation and reload', async t => {
  const p = await pageFor(t); await p.goto(base)
  const response = await p.request.post(`${base}/api/agent/plan`, { timeout: 120000, data: { account_id: 20111, income_fraction: .7, bills_increase: .1, one_off_cost: 450, shock_duration: 4, use_ai: false } })
  assert.equal(response.status(), 200)
  const plan = await response.json()
  await p.goto(`${base}/goals`)
  await p.getByRole('region', { name: 'Current shared plan' }).waitFor()
  assert.ok((await p.getByRole('region', { name: 'Current shared plan' }).innerText()).includes(plan.ranked.find(c => c.label === plan.recommended)?.action ?? plan.recommended))
  const roadmap = await (await p.request.get(`${base}/api/roadmap/20111`)).json()
  assert.equal(roadmap.summary.recommended, plan.recommended)
  await p.goto(`${base}/roadmap`); await p.reload()
  await p.getByRole('region', { name: 'Current shared plan' }).waitFor()
})


test('scenario cards fit desktop and mobile, and can expand', async t => {
  for (const width of [1280, 390]) {
    const p = await pageFor(t, 20111, { viewport: { width, height: 900 } }); await p.goto(base)
    await p.getByRole('button', { name: 'Try a life scenario' }).click()
    const grid = p.locator('.thread-figure-canvas > .scenario-card-grid').last()
    await grid.waitFor()
    assert.ok(await grid.locator('button').count() >= 3)
    assert.ok(await grid.evaluate(el => [...el.children].every(c => {
      const r = c.getBoundingClientRect(), g = el.getBoundingClientRect()
      return r.left >= g.left - 1 && r.right <= g.right + 1 && r.bottom <= g.bottom + 1 && c.scrollHeight <= c.clientHeight + 1
    })))
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await grid.scrollIntoViewIfNeeded()
    await p.waitForTimeout(500)
    await p.screenshot({ path: `../.runtime/cards-${width}.png`, fullPage: true })
    await p.getByRole('button', { name: 'Expand visual' }).last().click()
    await p.getByRole('dialog', { name: 'Expanded visual' }).waitFor()
    await p.getByRole('button', { name: 'Close expanded visual' }).click()
  }
})

test('agent flow defaults closed and shows observed handoffs; questions stand out', async t => {
  const p = await pageFor(t)
  await p.addInitScript(() => localStorage.setItem('pulp.backstage', '1'))
  const events = [
    ['agent', { agent: 'engine', kind: 'text', summary: 'Calculated the monthly buffer', t: .2 }],
    ['handoff', { from: 'engine', to: 'director', title: 'Buffer ready', items: ['Monthly buffer: $400'], t: .3 }],
    ['storyboard', { beats: [{ id: 'question', visual: 'none', caption: 'We can work with that. Which expense would you protect first?', params: {}, duration_s: 0 }] }],
    ['done', {}]
  ]
  await p.route('**/api/agent/stage?*', route => route.fulfill({ contentType: 'text/event-stream', body: events.map(([event,data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('') }))
  await p.goto(base)
  assert.equal(await p.getByRole('dialog', { name: 'Follow the thinking.' }).count(), 0)
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('Help me decide')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  const question = p.locator('.pulp-question p').filter({ hasText: 'Which expense' })
  await question.waitFor()
  assert.ok(await question.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 25))
  await p.getByRole('button', { name: 'Show agent flow' }).click()
  const flow = p.getByRole('dialog', { name: 'Follow the thinking.' })
  await flow.getByText('Calculated the monthly buffer', { exact: true }).waitFor()
  await flow.getByText('Buffer ready', { exact: true }).waitFor()
  await flow.getByText('What was passed along').click()
  await flow.getByText('Monthly buffer: $400', { exact: true }).waitFor()
  await p.screenshot({ path: '../.runtime/agent-flow.png', fullPage: true })
  await p.keyboard.press('Escape')
  assert.equal(await flow.count(), 0)
  await p.reload()
  assert.equal(await flow.count(), 0)
})


test('vacation confirmation continues with one useful question', { timeout: 45000 }, async t => {
  const p = await pageFor(t, 20133); await p.goto(base)
  const input = p.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('go on vacation')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await p.getByRole('button', { name: 'Confirm', exact: true }).waitFor()
  await input.fill('yes')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await p.getByText('When would you like to take that vacation?', { exact: true }).waitFor()
  const result = await (await p.request.get(`${base}/api/context/20133`)).json()
  assert.ok(result.summary.goals.some(g => g.type === 'travel'))
  assert.equal(await p.getByText('Here is how that looks in your numbers.', { exact: true }).count(), 0)
})


test('everyday and bigger decisions start as contextual conversation', { timeout: 45000 }, async t => {
  const p = await pageFor(t, 20133); await p.goto(base)
  await p.getByRole('button', { name: 'A bigger life decision' }).click()
  await p.getByText(/keep the date, lower the budget, or wait longer/).waitFor()
  await p.getByRole('button', { name: 'A small everyday decision' }).click()
  await p.getByText(/We can compare: (change a bill date|add a monthly expense)/).waitFor()
  assert.equal(await p.locator('.thread-figure').count(), 0)
})


test('every workspace page shares navigation and fits desktop and mobile', { timeout: 120000 }, async t => {
  const pages = [ ['/briefings', 'Briefings & summaries'], ['/twin', 'Your financial picture'], ['/insights', 'Insights & evidence'], ['/shock', 'Prepare for a setback'], ['/goals', 'Goals & choices'], ['/roadmap', 'Your next steps'], ['/settings', 'Preferences & data'] ]
  for (const width of [1440, 390]) {
    const p = await pageFor(t, 20111, { viewport: { width, height: 960 } })
    for (const [path, title] of pages) {
      await p.goto(base + path)
      await p.getByRole('heading', { name: title, exact: true }).waitFor()
      await p.getByRole('navigation', { name: 'Planning workspace' }).waitFor()
      await p.waitForTimeout(700)
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow: ${path} at ${width}: ${await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed').slice(0,12).map(e => e.className).join(', '))}`)
      await p.screenshot({ path: `../.runtime/workspace-${path.slice(1)}-${width}.png` })
    }
  }
})

test('insight questions lead back to the same conversation as a draft', { timeout: 45000 }, async t => {
  const p = await pageFor(t, 20111); await p.goto(base + '/insights')
  const evidence = p.getByRole('region', { name: 'Insights for your decisions' })
  await evidence.waitFor()
  const link = evidence.locator('a').first()
  await link.click()
  const input = p.getByRole('textbox', { name: 'Message', exact: true })
  await input.waitFor()
  assert.match(await input.inputValue(), /Help me answer this using my records/)
})


test('reported balances and goal savings persist and inform briefings', { timeout: 60000 }, async t => {
  const p = await pageFor(t, 20133)
  const setup = await p.request.post(`${base}/api/context/edit`, { data: { account_id: 20133, change: { field: 'goals', operation: 'add', value: { type: 'travel', label: 'A family holiday', target_amount: 5000, target_months: 12 } }, replan: false } })
  assert.ok(setup.ok())
  await p.goto(base + '/twin')
  await p.getByRole('button', { name: 'Update balances' }).click()
  await p.getByRole('button', { name: 'Add asset', exact: true }).click()
  await p.getByLabel('Description', { exact: true }).fill('Savings account')
  await p.getByLabel('Amount (CAD)', { exact: true }).fill('8000')
  await p.getByRole('button', { name: 'Add liability', exact: true }).click()
  await p.getByLabel('Description', { exact: true }).nth(1).fill('Outstanding card balance')
  await p.getByLabel('Amount (CAD)', { exact: true }).nth(1).fill('2000')
  await p.getByRole('button', { name: 'Save balances', exact: true }).click()
  await p.getByText('Difference for listed items', { exact: false }).waitFor()
  await p.getByLabel('Already set aside for A family holiday', { exact: true }).fill('1250')
  await p.getByRole('button', { name: 'Save progress', exact: true }).click()
  await p.getByText('25%', { exact: true }).waitFor()
  await p.reload()
  await p.getByText('25%', { exact: true }).waitFor()
  const result = await (await p.request.get(`${base}/api/customers/20133/overview`)).json()
  assert.equal(result.position.asset_total, 8000)
  assert.equal(result.position.difference, 6000)
  assert.equal(result.goals.find(g => g.type === 'travel').saved, 1250)
  await p.goto(base + '/briefings')
  await p.getByRole('heading', { name: 'Your daily perspective' }).waitFor()
  await p.getByRole('button', { name: 'Weekly summary', exact: true }).click()
  await p.getByRole('heading', { name: 'Your week in perspective' }).waitFor()
  await p.getByText(/Updated financial position/).waitFor()
  assert.match(await p.locator('main').innerText(), /No new bank transactions/)
})


test('scenario walkthrough plays in one inline frame without delaying the question or adding a voice', { timeout: 30000 }, async t => {
  const p = await pageFor(t, 20111, { viewport: { width: 390, height: 844 } })
  await p.addInitScript(() => { window.ttsCalls = 0; speechSynthesis.speak = () => window.ttsCalls++ })
  const scenes = [
    { id: 'one', visual: 'cards', caption: 'First, consider the unexpected expense.', duration_s: 3, params: { cards: [{ key: 'furnace', title: 'Unexpected repair', text: 'An essential repair needs a plan.' }] } },
    { id: 'two', visual: 'cards', caption: 'Then compare a smaller commitment.', duration_s: 3, params: { cards: [{ key: 'layoff', title: 'A smaller commitment', text: 'Consider what you can protect.' }] } },
    { id: 'question', visual: 'none', caption: 'Which expense would you protect?', duration_s: 5, params: {} }
  ]
  await p.route('**/api/agent/stage?*', route => route.fulfill({ contentType: 'text/event-stream', body: `event: storyboard\ndata: ${JSON.stringify({ beats: scenes })}\n\nevent: done\ndata: {}\n\n` }))
  await p.goto(base)
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('Show me this scenario')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  const sequence = p.getByRole('region', { name: 'Animated walkthrough' })
  await sequence.getByText('Scene 1 of 2', { exact: true }).waitFor()
  await p.getByText('Which expense would you protect?', { exact: true }).waitFor()
  assert.equal(await sequence.locator('.thread-figure').count(), 1)
  await sequence.getByText('Scene 2 of 2', { exact: true }).waitFor()
  await sequence.getByRole('button', { name: 'Previous scene' }).click()
  await sequence.getByText('Scene 1 of 2', { exact: true }).waitFor()
  await p.waitForTimeout(3200)
  assert.equal(await sequence.getByText('Scene 1 of 2', { exact: true }).count(), 1)
  await sequence.getByRole('button', { name: 'Next scene' }).click()
  await sequence.getByRole('button', { name: 'Replay walkthrough' }).click()
  await sequence.getByText('Scene 1 of 2', { exact: true }).waitFor()
  await sequence.getByText('Read all steps', { exact: true }).click()
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.equal(await p.evaluate(() => window.ttsCalls), 0)
  await p.screenshot({ path: '../.runtime/animated-walkthrough-mobile.png', fullPage: true })
  await p.emulateMedia({ reducedMotion: 'reduce' })
  await p.reload()
  await p.getByRole('textbox', { name: 'Message', exact: true }).fill('Show me this scenario')
  await p.getByRole('button', { name: 'Send', exact: true }).click()
  await sequence.getByText('Scene 1 of 2', { exact: true }).waitFor()
  assert.equal(await sequence.getByRole('button', { name: /Play animation sequence|Pause animation sequence/ }).count(), 0)
  await p.waitForTimeout(3200)
  assert.equal(await sequence.getByText('Scene 1 of 2', { exact: true }).count(), 1)
  await sequence.getByRole('button', { name: 'Next scene' }).click()
  await sequence.getByText('Scene 2 of 2', { exact: true }).waitFor()
})


test('resilience journey exposes the three challenge twists and both plans without intake', { timeout: 45000 }, async t => {
  const p = await pageFor(t, 20133)
  await p.goto(base)
  await p.getByRole('link', { name: 'Test a customer and shock', exact: true }).click()
  await p.getByRole('navigation', { name: 'Resilience journey steps' }).waitFor()
  await p.getByRole('heading', { name: 'Account 20133', exact: true }).waitFor()
  for (const preset of ['Layoff, EI at 55%', 'Furnace repair', 'Layoff + bills up 15%']) {
    const response = p.waitForResponse(r => r.url().includes('/api/shocks/calculate') && r.request().method() === 'POST')
    await p.getByRole('group', { name: 'Presets' }).getByRole('button', { name: preset, exact: false }).click()
    assert.equal((await response).status(), 200)
    await p.getByRole('heading', { name: 'Goal plan: before the shock', exact: false }).waitFor()
    await p.getByRole('heading', { name: 'Backup plan: if it happens', exact: false }).waitFor()
    assert.equal(await p.getByText(/Before I run this/).count(), 0)
  }
  await p.getByLabel('Duration', { exact: false }).fill('8')
  await p.getByText('Inputs changed. Recalculate to update the verdict and both plans.', { exact: true }).waitFor()
  assert.equal(await p.locator('#resilience-plans').count(), 0)
  await p.getByRole('button', { name: 'Recalculate', exact: true }).click()
  await p.getByText('Free up per month to last 8 months', { exact: true }).waitFor()
  await p.getByLabel('Demo account', { exact: true }).fill('20111')
  await p.getByRole('button', { name: 'Load', exact: true }).click()
  await p.getByRole('heading', { name: 'Account 20111', exact: true }).waitFor()
  await p.getByRole('heading', { name: 'Backup plan: if it happens', exact: false }).waitFor()
  await p.getByText('Explore personalized strategies and trade-offs', { exact: true }).click()
  await p.getByRole('button', { name: 'Compare practical options', exact: true }).click()
  await p.getByText('Option 1', { exact: true }).waitFor()
  assert.equal(await p.getByText('Grid only', { exact: true }).count(), 0)
  await p.getByLabel('Duration', { exact: false }).fill('9')
  await p.getByText('The scenario or your details changed. Compare options again to update the outcomes.', { exact: true }).waitFor()
  assert.equal(await p.getByText('Option 1', { exact: true }).count(), 0)
  await p.screenshot({ path: '../.runtime/resilience-journey.png', fullPage: true })
})


test('primary navigation stays focused and retired exploration links reach the scenario tool', async t => {
  const p = await pageFor(t)
  await p.goto(base + '/twin')
  const nav = p.getByRole('navigation', { name: 'Planning workspace' })
  assert.equal(await nav.locator('a').count(), 4)
  assert.deepEqual(await nav.locator('a').allTextContents(), ['Planning room', 'Prepare for a setback', 'Your financial picture', 'Goals & choices'])
  await p.getByRole('heading', { name: 'What you own. What you owe.' }).waitFor()
  assert.equal(await p.getByText('Financial vulnerability', { exact: true }).count(), 0)
  await p.goto(base + '/explore')
  await p.getByRole('heading', { name: 'Prepare for a setback', exact: true }).waitFor()
  assert.ok(p.url().endsWith('/shock'))
  assert.equal(await p.getByText('Simulation paths', { exact: true }).count(), 0)
  await p.goto(base + '/insights')
  await p.getByRole('region', { name: 'Insights for your decisions' }).waitFor()
  assert.equal(await p.getByText('Behavioural archetypes', { exact: true }).count(), 0)
  assert.equal(await p.getByText('Likely occupation', { exact: true }).count(), 0)
  await p.goto(base + '/goals')
  await p.getByRole('heading', { name: 'Your choices, side by side', exact: true }).waitFor()
  assert.equal(await p.locator('.diffrow').count(), 0)
  await p.getByRole('link', { name: 'Review your next steps', exact: true }).click()
  await p.getByRole('heading', { name: 'Your next steps', exact: true }).waitFor()
})
