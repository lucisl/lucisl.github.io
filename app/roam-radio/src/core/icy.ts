// ICY 元数据解析核心（纯逻辑）：Icecast mp3/aac 流每 metaint 字节音频后跟一段
// 长度前缀（1 字节 = 16 块）的 "StreamTitle='...';..." 信息。
// APP 侧用流式 fetch 分块喂入，解析出变化的最新标题。跨块未收全的信息段
// 会暂存，等下一块补齐后再解析。

export interface IcyInfoParsed {
  /** StreamTitle（空/无则为 null）。 */
  title: string | null;
  /** 该信息段占用字节数（含首长度字节）。 */
  bytes: number;
}

/** 在 buf[0] 处解析一段 icy 信息；信息段不完整时返回 null（需更多字节）。 */
export function tryParseIcyInfo(buf: Uint8Array): IcyInfoParsed | null {
  if (buf.length < 1) return null;
  const len = buf[0] * 16;
  if (len === 0) return { title: null, bytes: 1 };
  if (buf.length < 1 + len) return null;
  let text = '';
  for (let i = 1; i < 1 + len; i++) {
    const c = buf[i];
    if (c === 0) break;
    text += String.fromCharCode(c);
  }
  const m = /StreamTitle='([^']*)'/.exec(text);
  const raw = m ? m[1] : '';
  return { title: raw ? raw.replace(/\s+$/u, '') : null, bytes: 1 + len };
}

/**
 * 有状态解析器：push(chunk) 喂入流分块，返回出现过的、与上次不同的最新标题，否则 null。
 */
export class IcyMetadataReader {
  /** 距下一个 icy-info 边界还差多少音频字节 */
  private audioNeeded: number;
  /** 正在累积的信息段（首元素是长度字节） */
  private info: number[] = [];
  private last: string | null = null;

  constructor(public metaint: number) {
    this.audioNeeded = metaint;
  }

  push(chunk: Uint8Array): string | null {
    if (!(this.metaint > 0)) return null;
    let pos = 0;
    while (pos < chunk.length) {
      if (this.info.length > 0 || this.audioNeeded === 0) {
        // 处于信息段（或刚走到边界）：累积并尝试解析
        const avail = chunk.subarray(pos);
        for (let k = 0; k < avail.length; k++) this.info.push(avail[k]);
        const parsed = tryParseIcyInfo(Uint8Array.from(this.info));
        if (!parsed) {
          pos = chunk.length; // 等信息段补齐
          break;
        }
        pos += parsed.bytes;
        this.info = [];
        this.audioNeeded = this.metaint;
        if (parsed.title && parsed.title !== this.last) {
          this.last = parsed.title;
          return parsed.title;
        }
      } else {
        const take = Math.min(this.audioNeeded, chunk.length - pos);
        this.audioNeeded -= take;
        pos += take;
      }
    }
    return null;
  }

  get current(): string | null {
    return this.last;
  }
}
