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
  browser = await chromium.launch({ channel: process.env.PULP_BROWSER_CHANNEL || 'chrome', headless: true })
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

test('conversation home loads real account and opens financial snapshot', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await p.getByRole('textbox', { name: 'Message PULP' }).waitFor()
  await p.getByText('#20111', { exact: true }).waitFor()
  await p.getByRole('button', { name: 'Your financial context is here' }).click()
  await p.getByRole('heading', { name: 'Account 20111' }).waitFor()
})

test('typed proposal requires confirmation and survives reload', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await p.getByLabel('Message PULP').fill('I want to buy a home in five years.')
  await p.getByRole('button', { name: 'Send message' }).click()
  await p.getByRole('button', { name: 'Confirm & update my plan' }).click()
  await p.getByText('Saved to your context. Your plan has been updated.', { exact: true }).waitFor()
  await p.reload()
  await p.locator('.focus-chips').getByText(/buy a home/i).waitFor()
})

test('declining proposed context leaves no accepted goal', async t => {
  const p = await pageFor(t, 20133)
  await p.goto(base)
  await p.getByLabel('Message PULP').fill('I want to move out next year.')
  await p.getByRole('button', { name: 'Send message' }).click()
  await p.getByRole('button', { name: 'Not now' }).click()
  await p.getByText('Proposal dismissed. Your context is unchanged.', { exact: true }).waitFor()
  const result = await (await p.request.get(`${base}/api/context/20133`)).json()
  assert.equal(result.summary.goals.length, 0)
})

test('mobile navigation reaches research without horizontal overflow', async t => {
  const p = await pageFor(t, 20111, { viewport: { width: 390, height: 844 } })
  await p.goto(base)
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await p.getByRole('button', { name: 'Open navigation' }).click()
  await p.getByRole('button', { name: 'Research & insights' }).click()
  await p.getByText('Ever had a negative balance day', { exact: true }).waitFor()
})

test('replaying intro can be skipped and restores composer', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await p.getByRole('button', { name: 'Replay introduction' }).click()
  await p.getByRole('button', { name: /Skip intro/ }).click()
  await p.getByLabel('Message PULP').fill('Ready')
  assert.equal(await p.getByLabel('Message PULP').inputValue(), 'Ready')
})

test('chat network failure restores the unsent draft', async t => {
  const p = await pageFor(t)
  await p.route('**/api/agent/chat', route => route.abort())
  await p.goto(base)
  await p.getByLabel('Message PULP').fill('Keep this question')
  await p.getByRole('button', { name: 'Send message' }).click()
  await p.getByRole('status').filter({ hasText: /Please try again/ }).waitFor()
  assert.equal(await p.getByLabel('Message PULP').inputValue(), 'Keep this question')
})

test('microphone denial keeps typed conversation available', async t => {
  const p = await pageFor(t)
  await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone denied') } })
  await p.goto(base)
  await p.getByRole('button', { name: 'Start voice conversation' }).click()
  await p.getByRole('status').waitFor()
  await p.getByLabel('Message PULP').fill('Use text instead')
  assert.equal(await p.getByLabel('Message PULP').isEnabled(), true)
})

test('future simulator returns model outputs', async t => {
  const p = await pageFor(t)
  await p.goto(`${base}/explore`)
  await p.getByRole('button', { name: 'Simulate', exact: true }).click()
  await p.getByText('Median buffer at horizon', { exact: true }).waitFor()
})

test('goal review shows missing budget instead of fictional completion', async t => {
  const p = await pageFor(t)
  await p.goto(`${base}/goals`)
  await p.getByText('Budget needed', { exact: true }).waitFor()
  await p.getByText(/Projection extended from 24 to 60 months/).waitFor()
})

test('unknown account is reported without retaining prior financial snapshot', async t => {
  const p = await pageFor(t)
  await p.goto(base)
  await p.getByText('#20111', { exact: true }).waitFor()
  await p.getByRole('button', { name: /Demo account/ }).click()
  await p.getByLabel('Account ID', { exact: true }).fill('999999999')
  await p.getByRole('button', { name: 'Load account', exact: true }).click()
  await p.getByRole("alert").filter({ hasText: "Account 999999999 is not in the dataset." }).waitFor()
  assert.equal(await p.getByLabel('Message PULP').isDisabled(), true)
})


test('voice scenario stays staged and preserves unstated shock inputs on confirmation', async t => {
  const p = await pageFor(t)
  await p.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      return audio.createMediaStreamDestination().stream
    }
  })
  await p.routeWebSocket('**/api/agent/voice/*', socket => {
    setTimeout(() => {
      socket.send(JSON.stringify({ type: 'ready' }))
      socket.send(JSON.stringify({ type: 'proposal', proposal: { one_off_cost: 900, explanation: 'An unexpected bill' } }))
    }, 700)
  })
  await p.goto(base)
  await p.getByRole('button', { name: 'Start voice conversation' }).click()
  await p.getByText(/YOUR SPOKEN SCENARIO/).waitFor()
  assert.equal(new URL(p.url()).pathname, '/')
  const request = p.waitForRequest(r => r.url().includes('/api/shocks/calculate') && r.method() === 'POST')
  await p.getByRole('button', { name: 'Confirm & apply stated values' }).click()
  const body = (await request).postDataJSON()
  assert.equal(body.one_off_cost, 900)
  assert.equal(body.income_fraction, .55)
  await p.getByRole('heading', { name: 'Account 20111' }).waitFor()
})
