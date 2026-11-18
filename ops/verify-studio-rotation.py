import json
import re
import sys
import os
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


origin = 'https://plotstudio.pro'
workspace_path = '/studio/?workspace=1'
aliases = {
    f'https://dns-{part}.plotstudio.pro'
    for part in ('e82', 'k47', 'm13', 'r68', 't29', 'v54', 'x31', 'z76')
}
guest = build_opener(NoRedirect())
cookies = CookieJar()
admin = build_opener(NoRedirect(), HTTPCookieProcessor(cookies))


def read(opener, url, status, method='GET', body=None, headers=None):
    try:
        response = opener.open(Request(url, data=body, headers=headers or {}, method=method), timeout=12)
    except HTTPError as error:
        response = error
    with response:
        if isinstance(status, int):
            status = (status,)
        if response.code not in status:
            raise RuntimeError(f'{method} {url}: HTTP {response.code}, expected {status}')
        return response.code, response.headers, response.read()


canonical_entries = ('/studio/', '/studio/?direct=1', '/studio/index.html', '/studio/editor')
for path in canonical_entries:
    assert read(guest, origin + path, 302)[1]['Location'] == '/sign-in'
read(guest, origin + '/studio/session', 404, headers={'Origin': 'https://unrelated.example'})
password = sys.stdin.readline().rstrip('\r\n')
_, headers, _ = read(admin, origin + '/login', 303, 'POST', urlencode({'password': password, 'next': '/studio/?direct=1'}).encode(), {
    'Origin': origin, 'Content-Type': 'application/x-www-form-urlencoded',
})
del password
assert headers['Location'] == '/studio/launch'
assert 'Domain=' not in headers['Set-Cookie']
assert 'SameSite=Strict' in headers['Set-Cookie']
previous = None
picked = set()
for path in canonical_entries * 6:
    _, headers, _ = read(admin, origin + path, 302)
    current = headers['Location']
    assert headers['Cache-Control'] == 'no-store'
    assert current.endswith(workspace_path) and current.removesuffix(workspace_path) in aliases
    assert current != previous
    picked.add(current)
    previous = current
assert len(picked) > 2
_, headers, launch = read(admin, origin + '/studio/launch', 200)
assert headers['Cache-Control'] == 'no-store'
destination = re.search(rb'<a href="([^"]+)">Open Studio</a>', launch)[1].decode()
assert destination.endswith(workspace_path) and destination.removesuffix(workspace_path) in aliases
assert destination != previous
for alias in aliases:
    _, headers, _ = read(guest, alias + '/studio/', 302)
    assert headers['Location'] == origin + '/studio/launch'
    _, headers, content = read(guest, alias + workspace_path, 200)
    assert 'no-store' in headers['Cache-Control']
    assert b'id="studio-frame"' in content
    assert b'Open Studio directly' not in content and b'direct=1' not in content
    assert b'href="/xaxxaxaxaxa.css"' in content and b'src="/xaxxaxaxaxa.mjs"' in content
    assert b'_studio-alias' not in content
    read(guest, alias + '/_studio-alias.css', 404)
    read(guest, alias + '/_studio-alias.mjs', 404)
    assert read(guest, alias + '/xaxxaxaxaxa.css', 200)[1]['Content-Type'].startswith('text/css')
    assert origin in headers['Content-Security-Policy']
    read(guest, alias + '/studio/api/projects', 404)

current_origin = destination.removesuffix(workspace_path)
cors = {'Origin': current_origin}
assert json.loads(read(guest, origin + '/studio/session', 200, headers=cors)[2]) == {'authenticated': False}
_, cors_headers, payload = read(admin, origin + '/studio/session', 200, headers=cors)
assert cors_headers['Access-Control-Allow-Origin'] == current_origin
assert json.loads(payload) == {'authenticated': True}
frame = {'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-site', 'Referer': current_origin + '/'}
assert read(guest, origin + '/studio/editor', 401, headers=frame)[1]['X-Frame-Options'] == 'DENY'
read(admin, origin + '/studio/editor', 403, headers={**frame, 'Referer': 'https://unrelated.example/'})
_, embedded_headers, editor = read(admin, origin + '/studio/editor', 200, headers=frame)
assert b'Website editor' in editor and not embedded_headers.get('X-Frame-Options')
assert all(alias in embedded_headers['Content-Security-Policy'] for alias in aliases)
assert "'self'" not in embedded_headers['Content-Security-Policy']
assert b'/studio/editor' in read(guest, current_origin + '/xaxxaxaxaxa.mjs', 200)[2]
if os.environ.get('PLOT_EXPECT_DISTRIBUTED_BOOT') == '1':
    import base64
    import hashlib
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    def decode(value):
        return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))

    def boot_document(document):
        identifier = re.search(rb'data-studio-boot="([A-Za-z0-9_-]{43})"', document)[1].decode()
        public_key = re.search(rb'data-boot-key="([A-Za-z0-9_-]+)"', document)[1].decode()
        _, headers, response = read(admin, origin + '/studio/boot/' + identifier, 200)
        assert headers['Cache-Control'] == 'no-store'
        envelope = json.loads(response)
        payload = decode(envelope['payload'])
        raw_signature = decode(envelope['signature'])
        signature = utils.encode_dss_signature(int.from_bytes(raw_signature[:32], 'big'), int.from_bytes(raw_signature[32:], 'big'))
        serialization.load_der_public_key(decode(public_key)).verify(signature, payload, ec.ECDSA(hashes.SHA256()))
        manifest = json.loads(payload)
        assert manifest['id'] == identifier and len(manifest['parts']) == 10
        read(guest, origin + '/studio/boot/' + identifier, 401)
        return manifest

    first_boot = boot_document(editor)
    chunks = []
    hosts = set()
    for part in first_boot['parts']:
        host = part['url'].split('/')[2]
        assert host.startswith('cnt2-') and host.endswith('.plotstudio.pro')
        hosts.add(host)
        _, headers, ciphertext = read(guest, part['url'], 200, headers={'Origin': origin})
        assert headers['Content-Type'] == 'application/octet-stream'
        assert headers['Cache-Control'] == 'no-store, private'
        assert headers['Access-Control-Allow-Origin'] == origin
        aad = f"{first_boot['id']}:{part['index']}:{first_boot['bundleHash']}".encode()
        plain = AESGCM(decode(part['key'])).decrypt(decode(part['iv']), ciphertext, aad)
        assert len(plain) == part['byteLength']
        assert base64.urlsafe_b64encode(hashlib.sha256(plain).digest()).rstrip(b'=').decode() == part['hash']
        chunks.append(plain)
        read(guest, part['url'], 403, headers={'Origin': 'https://unrelated.example'})
        read(guest, part['url'].split('/parts/')[0] + '/studio/api/projects', 404)
    assert len(hosts) == 10
    assembled = b''.join(chunks)
    assert len(assembled) == first_boot['byteLength']
    assert base64.urlsafe_b64encode(hashlib.sha256(assembled).digest()).rstrip(b'=').decode() == first_boot['bundleHash']
    second_boot = boot_document(read(admin, origin + '/studio/editor', 200, headers=frame)[2])
    assert first_boot['id'] != second_boot['id']
    assert first_boot['parts'][0]['key'] != second_boot['parts'][0]['key']
    assert first_boot['bundleHash'] == second_boot['bundleHash']
    for manifest in (first_boot, second_boot):
        read(admin, origin + '/studio/boot/' + manifest['id'], 204, method='DELETE', headers={'Origin': origin})
        read(admin, origin + '/studio/boot/' + manifest['id'], 404)
        read(guest, manifest['parts'][0]['url'], 404, headers={'Origin': origin})
    print('LIVE: all ten content domains passed TLS, signed manifest, AES-256-GCM assembly, origin restrictions, fresh keys and grant deletion.')
read(admin, origin + '/studio/logout', 303, 'POST', b'', {'Origin': origin})
assert json.loads(read(admin, origin + '/studio/session', 200, headers=cors)[2]) == {'authenticated': False}
print(f'LIVE: verified all eight HTTPS aliases, random per-entry selection ({len(picked)} distinct in 24 launches), no adjacent repeats, embedded editor and logout.')
