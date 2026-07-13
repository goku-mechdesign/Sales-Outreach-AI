import { randomUUID } from "node:crypto";
import { createTrackToken } from "./trackToken";
import { getPublicApiBaseUrl } from "./urls";

const URL_REGEX = /https?:\/\/[^\s<>"]+/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function newTrackingId(): string {
  return randomUUID();
}

export function buildOpenTrackingUrl(trackingId: string): string {
  return `${getPublicApiBaseUrl()}/track/open/${createTrackToken(trackingId)}.gif`;
}

export function buildClickTrackingUrl(trackingId: string, destinationUrl: string): string {
  return `${getPublicApiBaseUrl()}/track/click/${createTrackToken(trackingId)}?u=${encodeURIComponent(destinationUrl)}`;
}

/**
 * Converts a plain-text email body into a tracked HTML body: every http(s)
 * URL is rewritten to route through the click-tracking redirect (except
 * `excludeUrls`, e.g. the unsubscribe link, which stays direct so it isn't
 * conflated with campaign engagement), and an invisible 1x1 open-tracking
 * pixel is appended at the end.
 */
export function buildTrackedHtmlBody(
  plainBody: string,
  trackingId: string,
  excludeUrls: string[] = [],
): string {
  const excludeSet = new Set(excludeUrls);
  let html = "";
  let lastIndex = 0;

  for (const match of plainBody.matchAll(URL_REGEX)) {
    const url = match[0];
    const index = match.index ?? 0;
    html += escapeHtml(plainBody.slice(lastIndex, index));
    const href = excludeSet.has(url) ? url : buildClickTrackingUrl(trackingId, url);
    html += `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
    lastIndex = index + url.length;
  }
  html += escapeHtml(plainBody.slice(lastIndex));
  html = html.replace(/\n/g, "<br>\n");
  html += `<img src="${escapeHtml(buildOpenTrackingUrl(trackingId))}" width="1" height="1" alt="" style="display:none;border:0" />`;

  return `<!doctype html><html><body style="font-family:sans-serif;white-space:normal;">${html}</body></html>`;
}
