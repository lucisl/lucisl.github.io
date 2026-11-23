// 播放引擎：双 expo-audio 播放器（当前 + 预缓冲下一站）、线路失败自动切换、
// 订阅通知。核心选择/换线路逻辑复用 src/core/queue.ts 的纯函数。
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer as ExpoAudioPlayer } from 'expo-audio';
import { candidateAfterFailures, streamCandidates } from '../core/queue.ts';
import type { StationRow } from '../core/snapshot.ts';

export type EngineStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface EngineState {
  station: StationRow | null;
  status: EngineStatus;
  volume: number;
  muted: boolean;
  nowPlaying: string | null;
  error: string | null;
}

type Listener = () => void;

const CONNECT_TIMEOUT_MS = 12000;

class AudioEngine {
  private player: ExpoAudioPlayer | null = null;
  private prePlayer: ExpoAudioPlayer | null = null;
  private preRow: StationRow | null = null;
  private candidates: string[] = [];
  private failures = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusSub: { remove: () => void } | null = null;
  private listeners = new Set<Listener>();
  private modeReady: Promise<void> | null = null;

  state: EngineState = {
    station: null, status: 'idle', volume: 0.8, muted: false, nowPlaying: null, error: null,
  };

  /** 全部线路都失败时的回调（由上层决定换台）。 */
  onExhausted: ((row: StationRow) => void) | null = null;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): EngineState => this.state;

  private emit(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private ensureMode(): Promise<void> {
    if (!this.modeReady) {
      this.modeReady = setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: true,
        allowsRecording: false,
      }).then(() => undefined, () => {
        this.modeReady = null;
      });
    }
    return this.modeReady;
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private dispose(p: ExpoAudioPlayer | null) {
    if (!p) return;
    try {
      p.pause();
      p.remove();
    } catch {
      /* 已释放 */
    }
  }

  private attach(p: ExpoAudioPlayer) {
    this.statusSub?.remove();
    this.statusSub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.error) {
        this.failover(String(s.error));
        return;
      }
      if (s.playing && !s.isBuffering) {
        this.clearConnectTimer();
        if (this.state.status !== 'playing') this.emit({ status: 'playing', error: null });
      } else if (s.playing && s.isBuffering) {
        this.emit({ status: 'loading' });
      } else if (s.isLoaded && !s.playing && this.state.status === 'playing') {
        // 播放中途停止（非用户暂停）也走超时逻辑由 timer 处理
      }
    });
  }

  private armConnectTimer() {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this.player && this.state.status !== 'playing') {
        this.failover('连接超时');
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private failover(reason: string) {
    const next = candidateAfterFailures(this.candidates, this.failures + 1);
    if (next < this.candidates.length && next > this.failures) {
      this.failures = next;
      const url = this.candidates[next];
      this.emit({ status: 'loading', error: null });
      try {
        this.player?.replace(url);
        this.player?.play();
        this.armConnectTimer();
      } catch {
        this.giveUp(reason);
      }
    } else {
      this.giveUp(reason);
    }
  }

  private giveUp(reason: string) {
    this.clearConnectTimer();
    const row = this.state.station;
    this.emit({ status: 'error', error: reason });
    if (row && this.onExhausted) this.onExhausted(row);
  }

  /** 播放电台（自动尝试该台全部线路；全失败触发 onExhausted）。 */
  async play(row: StationRow) {
    await this.ensureMode();
    if (this.preRow && this.preRow.i === row.i && this.prePlayer) {
      // 命中预缓冲：直接转正
      this.dispose(this.player);
      this.player = this.prePlayer;
      this.prePlayer = null;
      this.preRow = null;
      this.attach(this.player);
      this.candidates = streamCandidates(row);
      this.failures = 0;
      this.player.volume = this.state.volume;
      this.player.play();
      this.emit({ station: row, status: 'loading', nowPlaying: null, error: null });
      this.armConnectTimer();
      return;
    }
    this.dispose(this.player);
    this.candidates = streamCandidates(row);
    this.failures = 0;
    this.player = createAudioPlayer({ uri: this.candidates[0] }, { keepAudioSessionActive: true });
    this.attach(this.player);
    this.player.volume = this.state.volume;
    this.emit({ station: row, status: 'loading', nowPlaying: null, error: null });
    this.player.play();
    this.armConnectTimer();
  }

  /** 预缓冲下一站（前台创建播放器让 AVPlayer 提前拉流缓冲，不 play）。 */
  prefetch(row: StationRow | null) {
    this.dispose(this.prePlayer);
    this.prePlayer = null;
    this.preRow = null;
    if (!row) return;
    try {
      const cands = streamCandidates(row);
      const p = createAudioPlayer({ uri: cands[0] });
      p.volume = 0;
      this.prePlayer = p;
      this.preRow = row;
    } catch {
      /* 预缓冲失败不影响主流程 */
    }
  }

  pause() {
    this.clearConnectTimer();
    this.player?.pause();
    this.emit({ status: 'paused' });
  }

  resume() {
    if (!this.player) return;
    this.emit({ status: 'loading' });
    this.armConnectTimer();
    this.player.play();
  }

  toggle() {
    if (this.state.status === 'playing' || this.state.status === 'loading') this.pause();
    else this.resume();
  }

  setVolume(v: number) {
    const vol = Math.max(0, Math.min(1, v));
    if (this.player) this.player.volume = this.state.muted ? 0 : vol;
    this.emit({ volume: vol });
  }

  toggleMute() {
    const muted = !this.state.muted;
    if (this.player) this.player.volume = muted ? 0 : this.state.volume;
    this.emit({ muted });
  }

  setNowPlaying(title: string | null) {
    if (title !== this.state.nowPlaying) this.emit({ nowPlaying: title });
  }

  get row(): StationRow | null {
    return this.state.station;
  }

}

export const engine = new AudioEngine();
