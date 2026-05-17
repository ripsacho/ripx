/**
 * UI helpers for launch preflight check rows.
 */

export function formatPreflightCheckMessage(check) {
  const message = String(check?.message || '').trim();
  const actionPath = String(check?.meta?.action_path || check?.action_path || '').trim();
  if (!actionPath || message.toLowerCase().includes(actionPath.toLowerCase())) {
    return message;
  }
  return `${message} (${actionPath})`;
}

export function preflightCheckTone(check) {
  const severity = String(check?.severity || 'ok').toLowerCase();
  if (severity === 'error') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'success';
}
