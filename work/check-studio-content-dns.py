import json
import socket
import sys
from pathlib import Path

hosts = json.loads(Path(sys.argv[1]).read_text())
expected = '79.137.72.48'
failed = False
for host in hosts:
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)})
        valid = addresses == [expected]
        print(host, ','.join(addresses), 'OK' if valid else 'CHECK_DNS', flush=True)
        failed |= not valid
    except OSError as error:
        failed = True
        print(host, type(error).__name__, flush=True)
sys.exit(1 if failed else 0)
