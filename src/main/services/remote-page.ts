/** The phone app (one self-contained page, served by RemoteServer). The source is
 *  remote-app.html; all server text is shown with textContent or escaped Markdown. */
import page from './remote-app.html?raw';

export const REMOTE_PAGE: string = page;
