"""Offline documentation consistency checks, not production schema validation."""
from decimal import Decimal
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(name):
    def reject(value):
        raise ValueError(f"Non-finite JSON value: {value}")
    return json.loads((ROOT / 'examples' / name).read_text(encoding='utf-8'), parse_constant=reject)


def validate_handoff(handoff):
    required = {'schema_version', 'handoff_id', 'session_id', 'account_id', 'channel',
                'utterance_summary', 'scenario_candidates', 'context_proposals',
                'clarifications', 'scenario_approval_receipt_id'}
    require(set(handoff) == required, 'Handoff fields differ from example contract')
    require(handoff['schema_version'] == 'pulp.planning.v1', 'Wrong version')
    require(handoff['channel'] in {'voice', 'text'}, 'Invalid intake channel')
    candidates = handoff['scenario_candidates']
    names = {'income_fraction', 'bills_increase', 'one_off_cost_cad', 'shock_start_month',
             'shock_duration_months', 'projection_horizon_months'}
    require(set(candidates) == names, 'Scenario fields mismatch')
    for name, candidate in candidates.items():
        require(set(candidate) == {'value', 'source', 'source_ref'}, f'Bad candidate {name}')
        require(candidate['source'] in {'user_stated', 'user_edited', 'user_selected_preset', 'unknown'}, 'Bad source')
        require(candidate['value'] is not None and bool(candidate['source_ref']), 'Ready fixture must be complete')
    value = {k: v['value'] for k, v in candidates.items()}
    for name in ('shock_start_month', 'shock_duration_months', 'projection_horizon_months'):
        require(type(value[name]) is int, f'{name} must be a strict integer')
    require(0 <= value['shock_start_month'] <= 119, 'Invalid start')
    require(1 <= value['shock_duration_months'] <= 120, 'Invalid duration')
    require(1 <= value['projection_horizon_months'] <= 120, 'Invalid horizon')
    require(value['shock_start_month'] + value['shock_duration_months'] <= value['projection_horizon_months'], 'Shock extends outside horizon')
    for name, low, high in [('income_fraction', 0, 5), ('bills_increase', -1, 10)]:
        require(type(value[name]) in (int, float) and low <= value[name] <= high, f'Invalid {name}')
    require(isinstance(value['one_off_cost_cad'], str) and re.fullmatch(r'\d+(?:\.\d{1,2})?', value['one_off_cost_cad']), 'Expense must be a plain decimal string')
    require(Decimal(value['one_off_cost_cad']) <= Decimal('100000000'), 'Expense exceeds bound')
    return value


def pointer(document, path):
    require(path.startswith('/'), 'JSON pointer must be absolute')
    value = document
    for token in path[1:].split('/'):
        token = token.replace('~1', '/').replace('~0', '~')
        value = value[int(token)] if isinstance(value, list) else value[token]
    return value


def validate_result(result, scenario):
    required = {'schema_version', 'run_id', 'request_id', 'input_fingerprint', 'status',
                'review_status', 'baseline_scenario_id', 'evidence', 'metrics', 'actions',
                'findings', 'resolutions', 'changes', 'questions', 'assumptions',
                'limitations', 'context_proposals', 'visuals', 'spoken_summary', 'acceptance'}
    require(set(result) == required, 'Result fields differ from example contract')
    require(result['schema_version'] == 'pulp.planning.v1', 'Wrong result version')
    require(result['status'] == 'complete', 'Expected completed fixture')
    require(result['review_status'] == {'advocate': 'complete', 'challenger': 'complete'}, 'Missing review')
    records = {e['evidence_id']: e for e in result['evidence']}
    require(len(records) == len(result['evidence']), 'Duplicate evidence IDs')
    for record in records.values():
        require(record['input_fingerprint'] == result['input_fingerprint'], 'Snapshot drift')
        require(bool(record['limitations']), 'Example evidence needs provenance/limitations')
    def refs(items):
        require(all(ref in records for ref in items), 'Unknown evidence reference')
    for metric in result['metrics']:
        refs([metric['evidence_id']])
        record = records[metric['evidence_id']]
        pointer(record, metric['value_pointer'])
        field = metric['value_pointer'].split('/')[-1]
        require(record['units'][field] == metric['unit'], 'Wrong metric unit')
    actions = {a['action_id'] for a in result['actions']}
    findings = {f['finding_id'] for f in result['findings']}
    require(len(actions) == len(result['actions']), 'Duplicate actions')
    require(len(findings) == len(result['findings']), 'Duplicate findings')
    require({r['finding_id'] for r in result['resolutions']} == findings, 'Missing finding resolution')
    require(len(result['resolutions']) == len(findings), 'Duplicate resolution')
    for item in result['actions'] + result['findings'] + result['resolutions']:
        refs(item['evidence_refs'])
    for item in result['resolutions']:
        require(set(item['action_ids']) <= actions, 'Unknown resolved action')
        require(item['status'] in {'addressed', 'rejected_with_evidence', 'unresolved'}, 'Invalid resolution')
    for change in result['changes']:
        require(change['action_id'] in actions and set(change['finding_ids']) <= findings, 'Invalid change references')
    for visual in result['visuals']:
        require(visual['kind'] in {'balance_timeline', 'review_changes'}, 'Unsupported fixture visual')
        refs(visual['evidence_ids'])
    # Independently verify the explicitly synthetic fixture arithmetic.
    income, spending, buffer = Decimal('5000'), Decimal('3500'), Decimal('10000')
    retained = income * Decimal(str(scenario['income_fraction']))
    expense = Decimal(scenario['one_off_cost_cad'])
    official = records['ev-official']['values']
    require(Decimal(official['monthly_gap_cad']) == spending - retained, 'Incorrect monthly gap')
    require(Decimal(official['buffer_after_expense_cad']) == buffer - expense, 'Incorrect remaining buffer')
    projection = records['ev-projection']['values']
    balances = [buffer]
    for month in range(scenario['projection_horizon_months']):
        if month == scenario['shock_start_month']:
            buffer -= expense
        affected = scenario['shock_start_month'] <= month < scenario['shock_start_month'] + scenario['shock_duration_months']
        buffer += (retained if affected else income) - spending
        balances.append(buffer)
    require([Decimal(v) for v in projection['balances_cad']] == balances, 'Wrong projection/timing')
    require(official['no_shortfall'] and official['runway_months'] is None, 'Wrong no-shortfall representation')
    alternate = records['ev-alternative']['values']
    require(Decimal(alternate['buffer_after_expense_cad']) == Decimal('10000') - Decimal(alternate['one_off_cost_cad']), 'Wrong counterfactual buffer')
    require(Decimal(alternate['immediate_funding_gap_cad']) == Decimal('2000'), 'Wrong counterfactual funding gap')
    require(result['acceptance']['eligible'] is False, 'Synthetic fixture must not be accepted')


def check_links():
    count = 0
    for path in ROOT.rglob('*.md'):
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
            if '://' in target or target.startswith('#'):
                continue
            local = target.split('#', 1)[0]
            require((path.parent / local).exists(), f'Broken local link: {path.name} -> {target}')
            count += 1
    return count


if __name__ == '__main__':
    handoff = load('intake-handoff.json')
    result = load('planning-result.json')
    scenario = validate_handoff(handoff)
    validate_result(result, scenario)
    # Prove the checker detects important fixture regressions.
    from copy import deepcopy
    invalid = deepcopy(handoff)
    invalid['scenario_candidates']['shock_duration_months']['value'] = 121
    try:
        validate_handoff(invalid)
    except ValueError:
        pass
    else:
        raise ValueError('Invalid duration was not rejected')
    invalid = deepcopy(result)
    invalid['metrics'][0]['evidence_id'] = 'fabricated'
    try:
        validate_result(invalid, scenario)
    except ValueError:
        pass
    else:
        raise ValueError('Unknown evidence was not rejected')
    print(f'PASS: 2 synthetic fixtures, provenance/references, arithmetic, negative checks, and {check_links()} local documentation links.')
