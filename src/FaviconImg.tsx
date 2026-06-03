import { useState } from 'react';
import { getFaviconUrl, getDomainFirstChar } from './bookmarks';
import { hashColor } from './bookmarkDragDom';

export function FaviconImg({ url, large }: { url: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url, 32);

  const svg = (
    <svg className={`bookmark-favicon-svg${large ? ' bookmark-favicon-svg--lg' : ''}`} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" className="favicon-bg" />
      <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fill={hashColor(url)} fontSize="16" fontWeight="600" fontFamily="-apple-system, sans-serif">
        {getDomainFirstChar(url)}
      </text>
    </svg>
  );

  if (!src || failed) return svg;
  const cls = large ? 'bookmark-favicon bookmark-favicon--lg' : 'bookmark-favicon';
  return <img className={cls} src={src} alt="" onError={() => setFailed(true)} />;
}
