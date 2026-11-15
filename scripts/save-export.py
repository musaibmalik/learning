#!/usr/bin/env python3
"""Save a Claude Docs export or widget read into content/.

Usage:
  python3 scripts/save-export.py tab <tab-id> <tool-result.json|->
  python3 scripts/save-export.py widget <node-id> <tool-result.json|->
The input is the raw tool result: the JSON text the Docs tool returned, or a saved
tool-results file (a list of content blocks). Base64 is decoded here, never retyped.
"""
import base64, json, os, sys
kind, ident, src = sys.argv[1], sys.argv[2], sys.argv[3]
raw = sys.stdin.read() if src == '-' else open(src).read()
data = json.loads(raw)
if isinstance(data, list):  # saved tool-results file
    data = next(json.loads(b['text']) for b in data if b.get('type') == 'text' and b['text'].lstrip().startswith('{'))
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content')
if kind == 'tab':
    d = data['data']
    body = base64.b64decode(d['bytes_b64'])
    assert len(body) == d['bytes'], 'size mismatch'
    open(os.path.join(root, 'tabs', ident + '.html'), 'wb').write(body)
elif kind == 'widget':
    open(os.path.join(root, 'widgets', ident + '.jsx'), 'w').write(data['value']['code'])
else:
    sys.exit('kind must be tab or widget')
print('saved', kind, ident)
