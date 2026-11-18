import contextlib
import ctypes
import errno
import io
import json
import resource
import sys
import traceback
from time import monotonic


LOG_BYTES = 8192
RESULT_BYTES = 512 * 1024
HANDLER_FILE = '<plot-python>'


class LogBuffer(io.TextIOBase):
    def __init__(self):
        self.data = bytearray()
        self.truncated = False

    @property
    def encoding(self):
        return 'utf-8'

    def write(self, value):
        remaining = LOG_BYTES - len(self.data)
        part = value[:remaining].encode('utf-8', errors='replace')
        self.data.extend(part[:remaining])
        self.truncated |= len(value) > remaining or len(part) > remaining
        return len(value)

    def text(self):
        return self.data.decode('utf-8', errors='replace') + ('\n[Log truncated]' if self.truncated else '')


def restrict_system_calls():
    seccomp = ctypes.CDLL('libseccomp.so.2')
    seccomp.seccomp_init.argtypes = [ctypes.c_uint32]
    seccomp.seccomp_init.restype = ctypes.c_void_p
    seccomp.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    seccomp.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    seccomp.seccomp_load.argtypes = [ctypes.c_void_p]
    seccomp.seccomp_release.argtypes = [ctypes.c_void_p]
    context = seccomp.seccomp_init(0x7fff0000)
    if not context:
        raise RuntimeError('Could not initialize the syscall filter.')
    denied = (
        'socket', 'socketcall', 'clone', 'clone3', 'fork', 'vfork', 'execve', 'execveat', 'unshare', 'setns',
        'mount', 'umount2', 'pivot_root', 'chroot', 'fsopen', 'fsconfig', 'fsmount', 'fspick', 'move_mount', 'open_tree', 'mount_setattr',
        'ptrace', 'process_vm_readv', 'process_vm_writev', 'pidfd_open', 'pidfd_getfd', 'pidfd_send_signal',
        'bpf', 'perf_event_open', 'userfaultfd', 'keyctl', 'add_key', 'request_key', 'open_by_handle_at',
        'io_uring_setup', 'io_uring_register', 'io_uring_enter', 'memfd_create', 'kexec_load', 'kexec_file_load', 'reboot',
    )
    try:
        for name in denied:
            number = seccomp.seccomp_syscall_resolve_name(name.encode('ascii'))
            if number >= 0 and seccomp.seccomp_rule_add(context, 0x00050000 | errno.EPERM, number, 0) != 0:
                raise RuntimeError('Could not apply the syscall filter.')
        if seccomp.seccomp_load(context) != 0:
            raise RuntimeError('Could not load the syscall filter.')
    finally:
        seccomp.seccomp_release(context)


def set_limits(timeout):
    for name, cap in (
        (resource.RLIMIT_AS, 384 * 1024 * 1024),
        (resource.RLIMIT_CPU, timeout + 1),
        (resource.RLIMIT_FSIZE, 768 * 1024),
        (resource.RLIMIT_NOFILE, 64),
        (resource.RLIMIT_CORE, 0),
    ):
        _, hard = resource.getrlimit(name)
        bound = cap if hard == resource.RLIM_INFINITY else min(cap, hard)
        resource.setrlimit(name, (bound, bound))


def script_error(issue):
    frames = traceback.extract_tb(issue.__traceback__)
    line = getattr(issue, 'lineno', None) or next((frame.lineno for frame in reversed(frames) if frame.filename == HANDLER_FILE), None)
    location = f'Line {line}: ' if line else ''
    return {'error': {'code': 'PYTHON_SCRIPT_ERROR', 'message': f'{location}{type(issue).__name__}: {issue}'[:460]}}


def main():
    request = json.load(sys.stdin.buffer)
    set_limits(request['timeout'])
    restrict_system_calls()
    if len(sys.argv) > 1:
        sys.path.append(sys.argv[1])
    started = monotonic()
    log = LogBuffer()
    namespace = {'__name__': '__plot_script__', '__file__': HANDLER_FILE}
    try:
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            exec(compile(request['source'], HANDLER_FILE, 'exec'), namespace)
            handler = namespace.get('run')
            if not callable(handler):
                raise TypeError('Define a function named run(input).')
            result = handler(request['values'])
        encoded = json.dumps(result, allow_nan=False, ensure_ascii=False, separators=(',', ':'))
        if len(encoded.encode('utf-8')) > RESULT_BYTES:
            raise ValueError('The JSON result exceeds 512 KiB.')
        response = f'{{"result":{encoded},"logs":{json.dumps(log.text())},"durationMs":{round((monotonic() - started) * 1000)}}}'
    except BaseException as issue:
        response = json.dumps(script_error(issue), ensure_ascii=True)
    sys.stdout.write(response)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stdout.write('{"error":{"code":"PYTHON_UNAVAILABLE","message":"The Python sandbox could not start."}}')
