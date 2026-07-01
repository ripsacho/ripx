import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null for empty or invalid input', () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime('not-a-date')).toBeNull();
  });

  it('formats recent timestamps as relative durations', () => {
    expect(formatRelativeTime('2026-06-25T11:58:00.000Z')).toBe('2 min ago');
    expect(formatRelativeTime('2026-06-25T10:00:00.000Z')).toBe('2 hr ago');
    expect(formatRelativeTime('2026-06-23T12:00:00.000Z')).toBe('2 days ago');
  });
});
