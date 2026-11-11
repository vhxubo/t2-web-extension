/**
 * `text/event-stream` 的最小增量解析器。
 *
 * 服务端每 25 秒发一次只有 `retry:` 的心跳帧，事件帧则形如
 * `data: {"type":"notification_update"}`；两者之间用空行分隔。
 * 这里只关心「带 data 的完整帧」：
 *
 * - 按行解析，兼容 LF / CRLF，也兼容一次 `read()` 只读到半行 / 半帧；
 * - 多个 `data:` 行按 SSE 规范用 `\n` 拼接；
 * - 注释行（`:` 开头）、`id:`、`retry:` 与未知字段忽略；
 * - 没有以空行结束的尾部半帧保留到下一次 `push()`，连接结束时直接丢弃。
 *
 * 不做重连、不做 JSON 解析：这些都在 `lib/notification-stream.ts` 里。
 */
export interface SseFrame {
  /** `event:` 字段；服务端当前不发送，保留给将来。 */
  event: string | null;
  /** `data:` 行拼接后的内容。 */
  data: string;
}

export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName: string | null = null;

  /** 喂入一段已解码的文本，返回这次凑齐的所有带 data 的帧。 */
  push(chunk: string): SseFrame[] {
    if (!chunk) return [];

    this.buffer += chunk;
    const frames: SseFrame[] = [];

    for (;;) {
      const lineEnd = this.buffer.indexOf('\n');
      if (lineEnd === -1) break;

      let line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      this.consumeLine(line, frames);
    }

    return frames;
  }

  /** 连接结束 / 重连时清掉未完成的半帧，避免下一段流串进来。 */
  reset(): void {
    this.buffer = '';
    this.dataLines = [];
    this.eventName = null;
  }

  private consumeLine(line: string, frames: SseFrame[]): void {
    if (line === '') {
      // 空行 = 帧结束。只有 data 的帧才需要回调；心跳帧在这里被自然丢掉。
      if (this.dataLines.length > 0) {
        frames.push({ event: this.eventName, data: this.dataLines.join('\n') });
      }
      this.dataLines = [];
      this.eventName = null;
      return;
    }

    // 以冒号开头的行是注释（也常用作保活），直接忽略。
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    // 规范：冒号后只去掉一个前导空格。
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') {
      this.dataLines.push(value);
    } else if (field === 'event') {
      this.eventName = value;
    }
    // id / retry / 未知字段：客户端用不到，忽略。
  }
}
