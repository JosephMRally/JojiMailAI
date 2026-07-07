/**
 * HTML-body hygiene (user-stories/typescript_email_ui.md): remote images are
 * blocked by default — every remote-fetch vector is stripped before the HTML
 * reaches the sandboxed iframe — until the user's per-message opt-in.
 * Scripts never run regardless (the iframe carries an empty sandbox), but an
 * empty sandbox does NOT block subresource image fetches, so this module is
 * the actual tracking-pixel barrier. Covered vectors: src/srcset attributes
 * in any quoting style (double, single, unquoted), absolute http(s) and
 * protocol-relative (//host) URLs, CSS url(...) in inline styles and
 * <style> blocks, and string-form @import. Inline data:/cid: images are not
 * remote and pass through untouched.
 */

/** A URL (or srcset candidate list) that would fetch from a remote host:
 * absolute http(s) or protocol-relative //, at the start or after a
 * whitespace/comma candidate separator. */
const REMOTE_URL_RE = /(?:^|[\s,])(?:https?:)?\/\//i;

/** src/srcset attributes in any quoting style; the value is captured. */
const IMAGE_ATTR_RE = /\s(?:src|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** CSS url(...) in any quoting style; the target is captured. */
const CSS_URL_RE = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;

/** String-form @import (the url() form is covered by CSS_URL_RE). */
const CSS_IMPORT_RE = /@import\s+(['"])([^'"]*)\1/gi;

function unquote(value: string): string {
  const first = value[0];
  return (first === '"' || first === "'") && value.length >= 2 && value.endsWith(first)
    ? value.slice(1, -1)
    : value;
}

function isRemote(url: string): boolean {
  return REMOTE_URL_RE.test(url.trim());
}

/** Strip every remote-image vector so no remote resource loads until opted in. */
export function blockRemoteImages(html: string): string {
  return html
    .replace(IMAGE_ATTR_RE, (attr, value: string) => (isRemote(unquote(value)) ? '' : attr))
    .replace(CSS_URL_RE, (expr, _quote, url: string) => (isRemote(url) ? 'url()' : expr))
    .replace(CSS_IMPORT_RE, (expr, _quote, url: string) => (isRemote(url) ? '@import ""' : expr));
}
