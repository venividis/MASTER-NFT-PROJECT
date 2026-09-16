/** A bearer credential may leave the browser only over TLS or local loopback. */
export function serviceOrigin(value, label = 'service') {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search || url.pathname !== '/' ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && loopback)) {
    throw Error(`Use an HTTPS origin for a remote ${label}, or HTTP loopback for local development. Credentials, paths, queries and fragments do not belong in the service URL.`);
  }
  return url.origin;
}
