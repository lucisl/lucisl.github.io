// 展示格式工具（纯函数为主，Hermes 有 Intl）
import { flagEmoji, type CountryInfo } from '../core/snapshot.ts';

/** 指定时区的当地时间 "HH:mm"；失败返回 ''。 */
export function localTimeInTz(tz: string, now: Date = new Date()): string {
  if (!tz) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  } catch {
    return '';
  }
}

export function locationLabel(city: string, country: CountryInfo): string {
  const flag = flagEmoji(country.code);
  const place = city && city !== country.name ? `${city}, ${country.name}` : country.name;
  return `${flag} ${place}`;
}

/** 电台副标题：流派 · 语言 · 码率 */
export function stationSubtitle(genres: string[], lang: string, bitrate: number): string {
  const parts: string[] = [];
  if (genres.length) parts.push(genres.slice(0, 2).join(', '));
  if (lang) parts.push(lang);
  if (bitrate > 0) parts.push(`${bitrate} kbps`);
  return parts.join(' · ');
}

const GENRE_ZH: Record<string, string> = {
  pop: '流行', rock: '摇滚', 'news & talk': '新闻谈话', jazz: '爵士', classical: '古典',
  electronic: '电子', hiphop: '嘻哈', 'hip-hop': '嘻哈', talk: '谈话', oldies: '金曲',
  country: '乡村', folk: '民谣', blues: '蓝调', soul: '灵魂乐', funk: '放克', reggae: '雷鬼',
  latin: '拉丁', kpop: '韩流', 'top 40': '榜单', hits: '热门', dance: '舞曲', techno: '科技舞曲',
  house: '浩室', trance: '迷幻', ambient: '氛围', metal: '金属', punk: '朋克', gospel: '福音',
  christian: '基督', sports: '体育', weather: '天气', traffic: '交通', children: '儿童',
  lounge: '轻松', chill: '弛放', lofi: '低保真', world: '世界音乐', local: '本地',
};

export function genreZh(name: string): string {
  return GENRE_ZH[name] ?? name;
}
