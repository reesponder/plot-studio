import os
from pathlib import Path
from time import monotonic

from python_runner import PythonRunError, python_status, run_python

status = python_status()
assert status['available'], status
assert {'numpy', 'pandas', 'openpyxl'} <= {item['name'].lower() for item in status['packages']}

source = """
import io
import numpy as np
import pandas as pd
from openpyxl import Workbook, load_workbook

def run(input):
    sales = pd.DataFrame(input)
    summary = sales.groupby('team')['units'].sum().to_dict()
    book = Workbook()
    book.active.append(['team', 'total'])
    for label, value in summary.items():
        book.active.append([label, value])
    buffer = io.BytesIO()
    book.save(buffer)
    buffer.seek(0)
    first = list(load_workbook(buffer).active.values)[1]
    print('Rows', len(sales))
    return {'groups': summary, 'spread': int(np.ptp(sales['units'])), 'first': list(first)}
"""
result = run_python(source, [{'team': 'A', 'units': 6}, {'team': 'B', 'units': 2}, {'team': 'A', 'units': 3}])
assert result['result'] == {'groups': {'A': 9, 'B': 2}, 'spread': 4, 'first': ['A', 9]}, result
assert result['logs'] == 'Rows 3\n', result

sentinel = Path('/tmp/plot-python-test-sentinel')
sentinel.write_text('sandbox should never read this', encoding='utf-8')
os.environ['PLOT_TEST_PRIVATE'] = 'sandbox should never see this'
checks = """
import os
import socket
import shutil

def outcome(fn):
    try:
        fn()
    except OSError:
        return True
    return False

def run(input):
    with open('scratch.csv', 'w') as scratch:
        scratch.write('id,total\\n1,17\\n')
    return {
        'reads': outcome(lambda: open(input)),
        'writes': outcome(lambda: open('/work/output', 'w')),
        'network': outcome(lambda: socket.socket(socket.AF_INET)),
        'subprocess': outcome(os.fork),
        'env': os.environ.get('PLOT_TEST_PRIVATE'),
        'proc': outcome(lambda: open('/proc/self/status')),
        'scratch': open('scratch.csv').read().splitlines()[-1],
        'scratchBytes': shutil.disk_usage('/tmp').total,
    }
"""
try:
    result = run_python(checks, str(sentinel))
    assert result['result'] == {'reads': True, 'writes': True, 'network': True, 'subprocess': True, 'env': None, 'proc': True, 'scratch': '1,17', 'scratchBytes': 16 * 1024 * 1024}, result
    assert run_python('import os\ndef run(input): return os.path.exists("scratch.csv")')['result'] is False
finally:
    sentinel.unlink()

def rejects(source, code, values=None, timeout=5, detail=''):
    try:
        run_python(source, values, timeout)
    except PythonRunError as error:
        assert error.code == code, (error.code, error)
        if detail:
            assert detail in str(error), error
    else:
        raise AssertionError(f'Expected {code}')

rejects('def run(input):\n    raise ValueError("bad row")', 'PYTHON_SCRIPT_ERROR', detail='Line 2: ValueError: bad row')
rejects('def run(input):\n    return "a" * 524288', 'PYTHON_SCRIPT_ERROR', detail='result exceeds')
rejects('def run(input): return input', 'PYTHON_INPUT', 'x'*524288)
start = monotonic()
rejects('def run(input):\n    while True: pass', 'PYTHON_TIMEOUT', timeout=1)
assert monotonic() - start < 3
assert run_python('def run(input): return {"ready": True}')['result'] == {'ready': True}
print('Sandbox package use, Unicode-safe JSON, logs, host/PID/network isolation and timeout recovery passed.')
