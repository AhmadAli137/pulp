/* Parses a judge's twist sentence into official shock inputs. Returns null when the message is not a scenario. */
import type { ShockInputs } from './api'

const WORDS: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 }
const num = (s: string) => (WORDS[s] ?? Number(s.replace(/,/g, '')))

export interface ParsedTwist { inputs: ShockInputs; description: string[]; oneOffInMonthsOfSpending?: number }

export function parseTwist(text: string): ParsedTwist | null {
  const t = text.toLowerCase()
  const desc: string[] = []
  let r = 1, h = 0, C = 0, T = 6, oneOffMonths: number | undefined
  let matched = false

  const jobLoss = /laid off|lay-?off|lose[sd]? (my |their |the )?job|job loss|unemploy|fired|let go|income (drops|falls|cut)|ei\b/.test(t)
  const pct = t.match(/(\d{1,3})\s*%/g)?.map((x) => Number(x.replace(/[^\d]/g, ''))) ?? []
  const retained = t.match(/(?:ei|income|pays?|retain|keep|earn)[^.%\d]{0,40}?(\d{1,3})\s*%/) ?? t.match(/(\d{1,3})\s*%\s*(?:of (?:their|my|usual|typical|the)?\s*(?:income|inflow|pay|earnings|salary))/)
  if (jobLoss || retained) {
    matched = true
    r = retained ? num(retained[1]) / 100 : 0.55
    desc.push(`income retained ${Math.round(r * 100)}%`)
  }
  const bills = t.match(/(?:bills?|rent|utilities|costs?|expenses?)[^.%\d]{0,30}?(?:up|increase[sd]?|rise[sd]?|go(?:es)? up|higher|jump)[^.%\d]{0,20}?(\d{1,3})\s*%/) ?? t.match(/(\d{1,3})\s*%\s*(?:more|higher|increase|rise)[^.]{0,20}?(?:bills?|rent|costs?)/)
  if (bills) { matched = true; h = num(bills[1]) / 100; desc.push(`household bills +${Math.round(h * 100)}%`) }
  else if (/(bills?|rent)\s*(go(es)? up|increase|rise)/.test(t) && pct.length === 1 && !retained) { matched = true; h = pct[0] / 100; desc.push(`household bills +${pct[0]}%`) }

  const monthsOfSpending = t.match(/(\w+)\s*(?:full\s*)?months?(?:'s| of|’s)\s*(?:typical |usual |their |my )?(?:spending|expenses|costs|outflow)/)
  const dollars = t.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k)?/)
  if (/repair|furnace|car|dentist|vet|emergency|surprise|one[- ]?time|one[- ]?off|unexpected|bill of|costs?/.test(t) && (monthsOfSpending || dollars)) {
    matched = true
    if (monthsOfSpending) { oneOffMonths = num(monthsOfSpending[1]); desc.push(`one-time cost of ${oneOffMonths} month${oneOffMonths === 1 ? '' : 's'} of typical spending`) }
    else if (dollars) { C = num(dollars[1]) * (dollars[2] ? 1000 : 1); desc.push(`one-time cost $${C.toLocaleString()}`) }
  }
  const dur = t.match(/(?:for|over|next|lasts?)\s*(\w+)\s*months?/) ?? t.match(/(\d+)\s*months?/)
  if (dur && !Number.isNaN(num(dur[1])) && num(dur[1]) > 0 && num(dur[1]) <= 120 && !(monthsOfSpending && dur[0] === monthsOfSpending[0])) { T = num(dur[1]); if (matched) desc.push(`${T}-month horizon`) }

  if (!matched) return null
  return { inputs: { income_fraction: r, bills_increase: h, one_off_cost: C, horizon_months: T }, description: desc, oneOffInMonthsOfSpending: oneOffMonths }
}
