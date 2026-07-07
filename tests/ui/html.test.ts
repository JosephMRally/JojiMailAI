/**
 * Remote-image blocking stories (user-stories/typescript_email_ui.md):
 * "HTML bodies rendered inside a sandboxed iframe with remote images blocked
 * by default behind a per-message 'load images' action" — the iframe's empty
 * sandbox blocks scripts but NOT subresource image fetches, so the blocker
 * itself must strip every remote-image vector, not just quoted http(s) src
 * attributes: unquoted src (valid HTML5), srcset (ubiquitous in marketing
 * mail), protocol-relative URLs, and CSS url(...) backgrounds. Inline
 * data:/cid: images are not remote and must survive.
 */
import { describe, expect, it } from 'vitest';
import { blockRemoteImages } from '../../src/ui/html';

const TRACKER = 'tracker.example.com';

describe('story: remote images are blocked by default — every vector, not just quoted src', () => {
  it('strips a double-quoted http(s) src attribute (the baseline case)', () => {
    const out = blockRemoteImages(`<p>Big sale</p><img src="https://${TRACKER}/pixel.png">`);
    expect(out).not.toContain(TRACKER);
    expect(out).toContain('Big sale');
  });

  it('strips a single-quoted http(s) src attribute', () => {
    const out = blockRemoteImages(`<img src='http://${TRACKER}/pixel.png' alt="a">`);
    expect(out).not.toContain(TRACKER);
    expect(out).toContain('alt="a"');
  });

  it('strips an UNQUOTED src attribute (valid HTML5)', () => {
    const out = blockRemoteImages(`<img src=https://${TRACKER}/p.png width=1>`);
    expect(out).not.toContain(TRACKER);
  });

  it('strips src case-insensitively', () => {
    const out = blockRemoteImages(`<IMG SRC=HTTPS://${TRACKER}/p.png>`);
    expect(out.toLowerCase()).not.toContain(TRACKER);
  });

  it('strips srcset attributes whose candidate list carries any remote URL', () => {
    const out = blockRemoteImages(
      `<img srcset="https://${TRACKER}/a.png 1x, https://${TRACKER}/b.png 2x" alt="promo">`,
    );
    expect(out).not.toContain(TRACKER);
  });

  it('strips a srcset that hides the remote URL behind a relative first candidate', () => {
    const out = blockRemoteImages(`<img srcset="cid:inline1 1x, //${TRACKER}/b.png 2x">`);
    expect(out).not.toContain(TRACKER);
  });

  it('strips protocol-relative src URLs (//host/...)', () => {
    const out = blockRemoteImages(`<img src="//${TRACKER}/p.png">`);
    expect(out).not.toContain(TRACKER);
  });

  it('strips remote CSS url(...) in inline styles', () => {
    const out = blockRemoteImages(
      `<div style="background: url(https://${TRACKER}/p.png)">offer</div>`,
    );
    expect(out).not.toContain(TRACKER);
    expect(out).toContain('offer');
  });

  it('strips remote CSS url(...) in <style> blocks, quoted and protocol-relative', () => {
    const out = blockRemoteImages(
      `<style>.h{background-image:url('//${TRACKER}/p.png')}</style><p>hi</p>`,
    );
    expect(out).not.toContain(TRACKER);
    expect(out).toContain('<p>hi</p>');
  });

  it('strips remote string-form @import in <style> blocks', () => {
    const out = blockRemoteImages(`<style>@import "https://${TRACKER}/mail.css";</style>`);
    expect(out).not.toContain(TRACKER);
  });
});

describe('story: only REMOTE images are blocked — inline content survives untouched', () => {
  it('keeps data: URI images', () => {
    const html = '<img src="data:image/png;base64,AAAA" alt="logo">';
    expect(blockRemoteImages(html)).toBe(html);
  });

  it('keeps cid: (attached inline) images', () => {
    const html = '<img src="cid:part1.abc@example.com">';
    expect(blockRemoteImages(html)).toBe(html);
  });

  it('keeps local CSS url(...) values', () => {
    const html = '<div style="background:url(data:image/gif;base64,AA)">x</div>';
    expect(blockRemoteImages(html)).toBe(html);
  });

  it('keeps all text content and non-image markup', () => {
    const html = '<h1>Invoice</h1><p>Please pay by <strong>Friday</strong>.</p>';
    expect(blockRemoteImages(html)).toBe(html);
  });
});
