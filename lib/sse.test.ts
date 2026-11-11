import { describe, expect, test } from 'bun:test';
import { SseParser } from './sse';

const typeOf = (data: string): string => JSON.parse(data).type;

describe('SseParser', () => {
  test('parses a complete data frame', () => {
    const parser = new SseParser();
    const frames = parser.push('data: {"type":"ready"}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBeNull();
    expect(typeOf(frames[0]?.data ?? '{}')).toBe('ready');
  });

  test('handles CRLF and frames split across reads', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"not')).toHaveLength(0);
    expect(parser.push('ification_update"}\r\n')).toHaveLength(0);
    const frames = parser.push('\r\n');
    expect(frames).toHaveLength(1);
    expect(typeOf(frames[0]?.data ?? '{}')).toBe('notification_update');
  });

  test('joins multiple data lines with newlines', () => {
    const parser = new SseParser();
    const frames = parser.push('data: {"type":\ndata: "ready"}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe('{"type":\n"ready"}');
    expect(typeOf(frames[0]?.data ?? '{}')).toBe('ready');
  });

  test('ignores heartbeats, comments and unknown fields', () => {
    const parser = new SseParser();
    const frames = parser.push(': keep-alive\nretry: 25000\nid: 7\nevent: ping\n\n');
    expect(frames).toHaveLength(0);

    expect(parser.push('retry: 25000\n\n')).toHaveLength(0);
    const next = parser.push('data: {"type":"ready"}\n\n');
    expect(next).toHaveLength(1);
  });

  test('keeps an incomplete trailing frame until it is terminated', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"ready"}\n')).toHaveLength(0);
    expect(parser.push('\n')).toHaveLength(1);
  });

  test('emits a frame once and resets per-frame state', () => {
    const parser = new SseParser();
    const frames = parser.push(
      'event: message\ndata: {"type":"ready"}\n\ndata: {"type":"reconnect"}\n\n',
    );
    expect(frames.map((frame) => typeOf(frame.data))).toEqual(['ready', 'reconnect']);
    expect(frames[0]?.event).toBe('message');
    expect(frames[1]?.event).toBeNull();
  });

  test('reset drops a half-received frame', () => {
    const parser = new SseParser();
    parser.push('data: {"type":"rea');
    parser.reset();
    expect(parser.push('data: {"type":"ready"}\n\n')).toHaveLength(1);
  });
});
