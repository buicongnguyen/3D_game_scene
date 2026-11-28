// © 2026 Bui Cong Nguyen · solluxlabs.com
// The author's mark (src/ui/brand.js): which hosts are the game's own, and the mark's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { homeHost, foreignCopy, MARK, COPYRIGHT, SITE_URL } from '../src/ui/brand.js';

test('brand: the home hosts and local test servers are home, other hosts are copies', () => {
  for (const h of ['buicongnguyen.github.io', 'solluxlabs.com', 'www.solluxlabs.com', 'localhost', '127.0.0.1', '[::1]', '192.168.0.12', ''])
    assert.equal(homeHost(h), true, h);
  for (const h of ['example.github.io', 'solluxlabs.com.evil.net', 'notsolluxlabs.com', 'games.example.com', '192.168.1', '10.0.0.5'])
    assert.equal(homeHost(h), false, h);
  assert.equal(foreignCopy({ hostname: 'localhost', search: '?brandcheck=foreign' }), true, 'the test switch shows the copy look');
  assert.equal(foreignCopy({ hostname: 'localhost', search: '' }), false);
});

test('brand: the words, and where they are written', () => {
  assert.equal(MARK, 'Bui Cong Nguyen · solluxlabs.com');
  assert.equal(COPYRIGHT, '© 2026 Bui Cong Nguyen');
  assert.equal(SITE_URL, 'https://solluxlabs.com');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="author" content="Bui Cong Nguyen/);
  assert.match(html, /<meta name="copyright" content="© 2026 Bui Cong Nguyen/);
  assert.match(fs.readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'), /Copyright \(c\) 2026 Bui Cong Nguyen \(solluxlabs\.com\)\. All rights reserved\./);
  assert.match(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).author, /Bui Cong Nguyen/);
});
