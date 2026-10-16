// 识曲核心：AudD 与 ACRCloud 请求参数构造（纯逻辑；哈希与网络在调用方注入）。
// 样本来源：从正在播放的流里截取的 ~12 秒 mp3 字节（APP 侧转 base64）。

export interface IdentifyParams {
  /** 目标端点，如 https://api.audd.io/ 或 https://identify-eu-west-1.acrcloud.com/v1/identify */
  endpoint: string;
  /** 表单字段（multipart 的普通字段部分）。 */
  fields: Record<string, string>;
  /** 样本字段名 + base64 内容（以 multipart 文件字段发送）。 */
  sample: { field: string; base64: string; filename: string; contentType: string };
}

export function audDParams(apiToken: string, sampleBase64: string): IdentifyParams {
  return {
    endpoint: 'https://api.audd.io/',
    fields: { api_token: apiToken },
    sample: { field: 'file', base64: sampleBase64, filename: 'sample.mp3', contentType: 'audio/mpeg' },
  };
}

export interface AcrCloudConfig {
  host: string; // identify-cn-beijing.acrcloud.com 等
  accessKey: string;
  accessSecret: string;
}

/**
 * ACRCloud rcv3 签名：base64 样本 + host + key + version + timestamp_us 拼接后
 * HMAC-SHA1(secret) 再 base64。md5/hmacSha1/base64 由调用方注入保持纯逻辑。
 */
export async function acrCloudParams(
  cfg: AcrCloudConfig,
  sampleBase64: string,
  opts: {
    sampleBytes: number;
    timestampUs: number;
    sign: (secret: string, data: string) => Promise<string>; // base64(HMAC-SHA1)
    encode64?: never;
  },
): Promise<IdentifyParams> {
  const data = sampleBase64 + cfg.host + cfg.accessKey + '1.0' + String(opts.timestampUs);
  const signature = await opts.sign(cfg.accessSecret, data);
  return {
    endpoint: `https://${cfg.host}/v1/identify`,
    fields: {
      sample: sampleBase64,
      sample_bytes: String(opts.sampleBytes),
      sample_format: 'mp3',
      access_key: cfg.accessKey,
      data_type: 'audio',
      signature_version: '1.0',
      timestamp: String(opts.timestampUs),
      signature,
    },
    // ACR 的 sample 放在普通字段里（base64），无文件字段
    sample: { field: '', base64: '', filename: '', contentType: '' },
  };
}

export function acrCloudFromAudDResult(json: unknown): { song: string; artist: string; release_date?: string } | null {
  const j = json as { result?: { song?: string; artist?: string; release_date?: string } | null };
  const r = j?.result;
  if (!r || !r.song) return null;
  return { song: r.song, artist: r.artist ?? '', release_date: r.release_date };
}

export function acrCloudResult(json: unknown): { song: string; artist: string } | null {
  const j = json as {
    status?: { code?: number };
    metadata?: { music?: { title?: string; artists?: { name?: string }[] }[] };
  };
  const m = j?.metadata?.music?.[0];
  if (!m?.title) return null;
  return { song: m.title, artist: m.artists?.[0]?.name ?? '' };
}

/** 12 秒 @128kbps ≈ 192KB；超出则截头尾（服务端对样本长度容忍度足够）。 */
export function clipSample(bytes: Uint8Array, maxBytes = 250_000): Uint8Array {
  if (bytes.length <= maxBytes) return bytes;
  const head = Math.floor(maxBytes * 0.6);
  const tail = maxBytes - head;
  const out = new Uint8Array(maxBytes);
  out.set(bytes.subarray(0, head), 0);
  out.set(bytes.subarray(bytes.length - tail), head);
  return out;
}
