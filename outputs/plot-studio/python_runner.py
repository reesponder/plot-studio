import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


MAX_INPUT_BYTES = 512 * 1024
MAX_SOURCE_BYTES = 32 * 1024
MAX_TIMEOUT = 15
MAX_OUTPUT_BYTES = 768 * 1024
PROGRAM = Path(__file__).with_name('python_sandbox.py').resolve()
SCRATCH = Path(__file__).with_name('python_scratch.py').resolve()
DEFAULT_LIBRARIES = '/opt/plot-studio/python-packages'


class PythonRunError(ValueError):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code = code
        self.status = status


def unavailable():
    return PythonRunError('PYTHON_UNAVAILABLE', 'Python scripts require the Linux Studio sandbox (bubblewrap and libseccomp).', 503)


def sandbox_configuration():
    if sys.platform != 'linux':
        raise unavailable()
    bwrap = shutil.which('bwrap', path='/usr/bin:/bin:/usr/local/bin')
    unshare = shutil.which('unshare', path='/usr/bin:/bin:/usr/local/bin')
    interpreter = Path('/usr/bin/python3').resolve()
    if not bwrap or not unshare or not interpreter.is_file() or not PROGRAM.is_file() or not SCRATCH.is_file():
        raise unavailable()
    libraries = Path(os.environ.get('PLOT_PYTHON_LIBRARIES', DEFAULT_LIBRARIES)).resolve()
    return bwrap, unshare, interpreter, libraries if libraries.is_dir() else None


def sandbox_command(configuration, scratch_directory):
    bwrap, unshare, interpreter, libraries = configuration
    command = [bwrap, '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
               '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'TZ', 'UTC', '--setenv', 'HOME', '/work',
               '--setenv', 'OPENBLAS_NUM_THREADS', '1', '--setenv', 'OMP_NUM_THREADS', '1', '--setenv', 'MKL_NUM_THREADS', '1',
               '--setenv', 'NUMEXPR_NUM_THREADS', '1', '--setenv', 'TMPDIR', '/tmp',
               '--dir', '/work', '--bind', scratch_directory, '/tmp', '--chdir', '/tmp', '--dev', '/dev']
    for path in ('/usr/lib', '/usr/lib64', '/lib', '/lib64'):
        location = Path(path)
        if location.is_symlink():
            command.extend(['--symlink', str(location.resolve()), path])
        elif location.is_dir():
            command.extend(['--ro-bind', path, path])
    command.extend(['--ro-bind', str(interpreter), str(interpreter), '--ro-bind', str(PROGRAM), '/runner.py'])
    if libraries:
        command.extend(['--ro-bind', str(libraries), '/python-packages'])
    command.extend(['--remount-ro', '/', '--', str(interpreter), '-I', '-S', '-B', '-u', '/runner.py'])
    if libraries:
        command.append('/python-packages')
    return [unshare, '--user', '--map-root-user', '--mount', '--propagation', 'private', '--',
            str(interpreter), '-I', '-S', '-B', str(SCRATCH), scratch_directory, *command]


def acquire_slot():
    import fcntl
    name = Path(tempfile.gettempdir()) / f'plot-python-{os.getuid()}.lock'
    descriptor = os.open(name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if info.st_uid != os.getuid() or info.st_nlink != 1 or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise unavailable()
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        raise PythonRunError('PYTHON_BUSY', 'Another Python script is running. Try again shortly.', 429) from None
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def run_python(source, values=None, timeout=5, *, _status_probe=False):
    if not isinstance(source, str) or not source.strip() or len(source.encode('utf-8', errors='replace')) > MAX_SOURCE_BYTES:
        raise PythonRunError('PYTHON_SOURCE', 'Use a Python script between 1 byte and 32 KiB.')
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout not in range(1, MAX_TIMEOUT + 1):
        raise PythonRunError('PYTHON_TIMEOUT_VALUE', 'Choose a whole timeout between 1 and 15 seconds.')
    timeout = int(timeout)
    try:
        input_json = json.dumps(values, allow_nan=False, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        source_json = json.dumps(source, ensure_ascii=False).encode('utf-8')
    except (UnicodeError, ValueError, TypeError, RecursionError) as issue:
        raise PythonRunError('PYTHON_INPUT', 'Use valid JSON input.') from issue
    if len(input_json) > MAX_INPUT_BYTES:
        raise PythonRunError('PYTHON_INPUT', 'The Python input exceeds 512 KiB.')
    data = b'{"source":' + source_json + b',"values":' + input_json + b',"timeout":' + str(timeout).encode('ascii') + b'}'
    configuration = sandbox_configuration()
    try:
        slot = None if _status_probe else acquire_slot()
    except OSError as issue:
        raise unavailable() from issue
    try:
        with tempfile.TemporaryDirectory(prefix='plot-python-') as scratch_directory, tempfile.TemporaryFile() as output:
            try:
                process = subprocess.run(sandbox_command(configuration, scratch_directory), input=data, stdout=output, stderr=subprocess.DEVNULL,
                                         timeout=timeout, check=False, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
            except subprocess.TimeoutExpired:
                raise PythonRunError('PYTHON_TIMEOUT', f'The Python script exceeded {timeout} seconds.', 504) from None
            except OSError as issue:
                raise unavailable() from issue
            output.seek(0)
            contents = output.read(MAX_OUTPUT_BYTES + 1)
    finally:
        if slot is not None:
            os.close(slot)
    if len(contents) > MAX_OUTPUT_BYTES:
        raise PythonRunError('PYTHON_OUTPUT', 'The Python sandbox produced too much output.')
    if process.returncode != 0:
        if process.returncode == 1 and not contents:
            raise unavailable()
        raise PythonRunError('PYTHON_PROCESS', 'The Python process stopped before returning a result.')
    try:
        payload = json.loads(contents, parse_constant=lambda _value: None)
    except (ValueError, RecursionError, UnicodeError):
        raise PythonRunError('PYTHON_OUTPUT', 'The Python sandbox did not return a valid result.') from None
    if isinstance(payload, dict) and isinstance(payload.get('error'), dict):
        fault = payload['error']
        if fault.get('code') == 'PYTHON_UNAVAILABLE':
            raise unavailable()
        raise PythonRunError('PYTHON_SCRIPT_ERROR', str(fault.get('message') or 'Python execution failed.')[:460])
    if not isinstance(payload, dict) or 'result' not in payload or not isinstance(payload.get('logs'), str) or type(payload.get('durationMs')) is not int:
        raise PythonRunError('PYTHON_OUTPUT', 'The Python sandbox did not return a valid result.')
    return {key: payload[key] for key in ('result', 'logs', 'durationMs')}


def python_status():
    status = {'available': False, 'version': '', 'packages': [], 'timeoutMax': MAX_TIMEOUT}
    try:
        _, _, _, libraries = sandbox_configuration()
        verified = run_python('def run(input):\n    import platform\n    return platform.python_version()', None, 3, _status_probe=True)
    except PythonRunError:
        return status
    status.update(available=True, version=verified['result'])
    if libraries:
        main_packages = {'numpy', 'pandas', 'openpyxl'}
        status['packages'] = [{'name': item.metadata['Name'], 'version': item.version}
                              for item in importlib.metadata.distributions(path=[str(libraries)])
                              if (item.metadata['Name'] or '').lower() in main_packages]
        status['packages'].sort(key=lambda item: item['name'].lower())
    return status
