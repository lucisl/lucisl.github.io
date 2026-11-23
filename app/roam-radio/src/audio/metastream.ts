// ICY 流元数据/采样采集（app 层，唯一依赖 react-native-fetch-api 的地方）。
// 设计：短连接轮询——连上读 ~2MB 后主动断开，间隔再连，省流量且不干扰播放缓冲；
// 播放本身由 expo-audio 另一条连接负责。识曲采样走独立短连接（去 ICY 段的纯音频）。
import rFetch from 'react-native-fetch-api';
import { IcyMetadataReader } from '../core/icy.ts';

const MAX_READ_BYTES = 2_000_000;
const RECONNECT_DELAY_MS = 20_000;

export interface MetastreamHandle {
  stop(): void;
}

/**
 * 轮询读取流内 StreamTitle。onTitle 每次变化回调。
 * onUnsupported：读不到 icy-metaint（该台无元数据）时回调一次并停止。
 */
export function startMetastream(
  url: string,
  onTitle: (t: string) => void,
  onUnsupported?: () => void,
): MetastreamHandle {
  let stopped = false;
  let reader: {
    cancel: () => Promise<unknown>;
    read: () => Promise<{ done: boolean; value: ArrayBuffer | Uint8Array }>;
  } | null = null;

  async function cycle() {
    while (!stopped) {
      try {
        const res = await rFetch(url, { headers: { 'Icy-MetaData': '1' } });
        const metaintStr = res.headers?.get?.('icy-metaint') ?? null;
        if (!metaintStr) {
          onUnsupported?.();
          return;
        }
        const metaint = Number(metaintStr);
        if (!metaint) {
          onUnsupported?.();
          return;
        }
        const icy = new IcyMetadataReader(metaint);
        const body = res.body;
        if (!body?.getReader) return;
        reader = body.getReader();
        let readTotal = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped || readTotal > MAX_READ_BYTES) break;
          const chunk: Uint8Array =
            value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
          readTotal += chunk.length;
          const t = icy.push(chunk);
          if (t) onTitle(t);
        }
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
      } catch {
        /* 网络失败静默重试 */
      }
      if (stopped) return;
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  }
  void cycle();

  return {
    stop() {
      stopped = true;
      try {
        void reader?.cancel();
      } catch {
        /* noop */
      }
    },
  };
}

/**
 * 采集纯音频样本（已剔除 ICY 信息段）。bytes 目标字节数；约 128kbps 时 12 秒 ≈ 192KB。
 * @returns 完成解析的字节数组；中止/失败时 reject。
 */
export function captureAudioSample(url: string, bytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const res = await rFetch(url, { headers: { 'Icy-MetaData': '1' } });
        const metaintStr = res.headers?.get?.('icy-metaint') ?? null;
        const metaint = metaintStr ? Number(metaintStr) : 0;
        const body = res.body;
        if (!body?.getReader) throw new Error('streaming unsupported');
        const reader = body.getReader();
        // 去 ICY：简单状态机（不需要解析内容，只要知道段长）
        let audioNeeded = metaint;
        let info: number[] = [];
        let infoTotal = 0;
        const out: number[] = [];
        const deadline = Date.now() + 45_000;
        while (out.length < bytes && Date.now() < deadline) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk: Uint8Array =
            value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
          let pos = 0;
          while (pos < chunk.length && out.length < bytes) {
            if (!metaint) {
              out.push(chunk[pos]);
              pos++;
            } else if (info.length > 0) {
              const take = Math.min(infoTotal - info.length, chunk.length - pos);
              info.push(...chunk.subarray(pos, pos + take));
              pos += take;
              if (info.length >= infoTotal) {
                info = [];
                audioNeeded = metaint;
              }
            } else if (audioNeeded > 0) {
              const take = Math.min(audioNeeded, chunk.length - pos, bytes - out.length);
              for (let k = 0; k < take; k++) out.push(chunk[pos + k]);
              audioNeeded -= take;
              pos += take;
            } else {
              infoTotal = 1 + chunk[pos] * 16;
              info.push(chunk[pos]);
              pos++;
            }
          }
        }
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
        if (out.length < bytes * 0.3) throw new Error('样本过短');
        resolve(Uint8Array.from(out));
      } catch (e) {
        reject(e);
      }
    })();
  });
}
