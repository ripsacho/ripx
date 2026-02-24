/**
 * LegalFooter
 *
 * Fetches Terms and Privacy URLs from public GET /api/config/legal and shows links when set.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';

function fetchLegal() {
  const url = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api/config/legal` : '/api/config/legal';
  return fetch(url)
    .then(r => (r.ok ? r.json() : Promise.resolve({ data: {} })))
    .then(res => res.data || res)
    .catch(() => ({}));
}

export default function LegalFooter() {
  const { data } = useQuery({
    queryKey: ['config', 'legal'],
    queryFn: fetchLegal,
    staleTime: 5 * 60 * 1000,
  });
  const termsUrl = data?.termsUrl ?? null;
  const privacyUrl = data?.privacyUrl ?? null;
  if (!termsUrl && !privacyUrl) return null;
  return (
    <footer
      style={{
        marginTop: '2rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--border-secondary, #e1e3e5)',
        fontSize: '0.8125rem',
        color: 'var(--text-secondary, #6d7175)',
      }}
    >
      {termsUrl && (
        <a
          href={termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginRight: '1rem' }}
        >
          Terms of Service
        </a>
      )}
      {privacyUrl && (
        <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
      )}
    </footer>
  );
}
