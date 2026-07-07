/**
 * HTML-body hygiene (user-stories/typescript_email_ui.md): remote images are
 * blocked by default — their src attributes are stripped before the HTML
 * reaches the sandboxed iframe — until the user's per-message opt-in.
 * Scripts never run regardless: the iframe carries an empty sandbox.
 */

/** Strip http(s) src attributes so no remote resource loads until opted in. */
export function blockRemoteImages(html: string): string {
  return html.replace(/\ssrc\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi, '');
}
