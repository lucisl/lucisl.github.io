// 识曲服务编排：抓 ~12s 样本 → 按设置里配置的 key 走 ACRCloud / AudD。
// 无任何 key 时 hasIdentifyKey() 为 false，UI 隐藏入口。
import { File as ExpoFile, Paths } from 'expo-file-system';
import { acrCloudParams, acrCloudFromAudDResult, acrCloudResult, audDParams, clipSample } from '../core/identify.ts';
import { bytesToBase64, hmacSha1Base64 } from '../core/sha1.ts';
import { captureAudioSample } from '../audio/metastream.ts';
import { getSetting } from '../store/db.ts';
import type { IdentifyResult } from './types.ts';

export async function identifyConfig(): Promise<{ acrHost: string; acrKey: string; acrSecret: string; auddToken: string }> {
  const [acrHost, acrKey, acrSecret, auddToken] = await Promise.all([
    getSetting('acr_host'), getSetting('acr_key'), getSetting('acr_secret'), getSetting('audd_token'),
  ]);
  return { acrHost: acrHost ?? '', acrKey: acrKey ?? '', acrSecret: acrSecret ?? '', auddToken: auddToken ?? '' };
}

export function hasIdentifyKey(cfg: Awaited<ReturnType<typeof identifyConfig>>): boolean {
  return Boolean((cfg.acrHost && cfg.acrKey && cfg.acrSecret) || cfg.auddToken);
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** 从当前播放的流 URL 采样识别。约 12s（@128kbps≈192KB）。 */
export async function identifyStream(url: string): Promise<IdentifyResult> {
  const cfg = await identifyConfig();
  const bytes = await captureAudioSample(url, 12 * 16_000);
  const sample = clipSample(bytes);

  // 1) ACRCloud（form-urlencoded，sample 走 base64 字段）
  if (cfg.acrHost && cfg.acrKey && cfg.acrSecret) {
    const b64 = bytesToBase64(sample);
    const ts = Date.now() * 1000;
    const params = await acrCloudParams(
      { host: cfg.acrHost, accessKey: cfg.acrKey, accessSecret: cfg.acrSecret },
      b64,
      { sampleBytes: sample.length, timestampUs: ts, sign: async (secret, data) => hmacSha1Base64(secret, data) },
    );
    const res = await fetch(params.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(params.fields),
    });
    const got = acrCloudResult(await res.json());
    if (got) return { ...got, service: 'acrcloud' };
    if (!cfg.auddToken) throw new Error('没有识别到这首歌');
  }

  // 2) AudD（multipart 文件上传：写临时 mp3 再 {uri} 形式提交）
  if (cfg.auddToken) {
    const tmp = new ExpoFile(Paths.cache, `sample-${Date.now()}.mp3`);
    if (!tmp.exists) tmp.create();
    await tmp.write(sample);
    try {
      const form = new FormData();
      form.append('api_token', cfg.auddToken);
      form.append('file', {
        uri: tmp.uri,
        name: 'sample.mp3',
        type: 'audio/mpeg',
      } as unknown as string);
      const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
      const got = acrCloudFromAudDResult(await res.json());
      if (got) return { song: got.song, artist: got.artist, service: 'audd' };
      throw new Error('没有识别到这首歌');
    } finally {
      try {
        tmp.delete();
      } catch {
        /* 临时文件失败无所谓 */
      }
    }
  }
  throw new Error('未配置识曲服务');
}
