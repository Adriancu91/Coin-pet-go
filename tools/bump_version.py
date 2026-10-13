"""Bump the game version so phones download fresh files (GitHub Pages caches for 10 min).
Run from the repo root before committing:  python3 tools/bump_version.py
- writes version.txt
- rewrites ?v=... on every css/js tag in index.html and window.APP_VERSION
"""
import re, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
(root / 'version.txt').write_text(v + '\n')
html = (root / 'index.html').read_text()
html = re.sub(r'(src="(?:config\.js|js/[a-z]+\.js))(\?v=\w+)?"', lambda m: f'{m.group(1)}?v={v}"', html)
html = re.sub(r'(href="css/style\.css)(\?v=\w+)?"', lambda m: f'{m.group(1)}?v={v}"', html)
html = re.sub(r"window\.APP_VERSION = '\w*';", f"window.APP_VERSION = '{v}';", html)
(root / 'index.html').write_text(html)
print('version', v)
