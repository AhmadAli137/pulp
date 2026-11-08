# PULP (Planning Under Life's Pressures)

**Elevator pitch:** Financial security isn't how much you earn. It's how ready you are when income changes. PULP reads
your bank records, tests life's shocks and hands you a plan.

**Live:** https://askpulp.com · **Code:** https://github.com/AhmadAli137/pulp

---

## Inspiration

Most people find out how fragile their money is the day something goes wrong. Their bank records could have told them
months earlier.

## What it does

Pick any account. PULP answers three questions:

- **How am I doing?** Money in, money out, how long your cushion lasts, and the one thing in your records you'd never
  spot yourself.
- **What if life happens?** Flip a card (a layoff, a broken furnace, a recession) and see month by month when the money
  runs out.
- **What should I do?** PULP tries about 300 real plans, drops the ones that don't fit your life, and gives you four
  clear options with steps and dates.

Ask Pulp, our tangerine companion, anything by text or voice.

## Our biggest finding

**Spending, not savings, decides who makes it.** Across 4,500 accounts facing the same six-month layoff, how much cash
people held barely changed who made it (57% to 73%). How much of their income they spent changed everything (99% down
to 25%). And it matches real life: accounts our engine flagged later had their loans go bad three times as often.

## How we built it

Python does every calculation, using the judges' exact formulas. Sixteen AI agents (Gemini on Google's Agent
Development Kit) decide what to look at, what to ask and how to say it, but never make up a number. React frontend,
live voice with Gemini Live, hosted on Vultr.

## Challenges

Keeping AI honest: every number it says is checked against the engine. And making plans fit real people, not
spreadsheets: a 58-year-old shouldn't be told to take up delivery work.

## Accomplishments

A live twist answered in about a second, a finding that holds up against real outcomes, and agents you can watch and
replay step by step.

## What we learned

"Do I have enough saved?" is the wrong question. "How fast does my money leave when income drops?" is the one that
matters, and it's one you can change this month.

## What's next

Live bank feeds, real benefit rules, and plans you can follow month by month.

## Built with

`python` `fastapi` `pandas` `gemini` `google-adk` `gemini-live` `react` `typescript` `vite` `vultr` `docker`

## Sources

- PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository:
  https://relational.fel.cvut.cz/dataset/Financial (via the Tangerine track)
- Government of Canada, Employment Insurance (55% income replacement):
  https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
- Personas in the app are fictional. Other shock amounts are illustrative, sized from each account's own spending.
