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
  await p.getByRole('button', { name: 'Research & insights' }).click()
  await p.getByText('Ever had a negative balance day', { exact: true }).waitFor()
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
  assert.ok((await p.getByRole('region', { name: 'Current shared plan' }).innerText()).includes(plan.recommended))
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
