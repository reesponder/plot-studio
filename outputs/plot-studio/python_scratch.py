import ctypes
import os
import sys


def main():
    directory, *command = sys.argv[1:]
    mount = ctypes.CDLL(None, use_errno=True).mount
    mount.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_char_p]
    flags = 2 | 4 | 8
    if mount(b'tmpfs', os.fsencode(directory), b'tmpfs', flags, b'size=16m,nr_inodes=256,mode=0700') != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))
    os.execv(command[0], command)


if __name__ == '__main__':
    main()
