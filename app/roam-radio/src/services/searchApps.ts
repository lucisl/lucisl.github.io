// 收藏曲名 → 跳转音乐 App 搜索（web 链接优先，装了 App 会自动接管）。
export function musicSearchUrls(query: string): { label: string; url: string }[] {
  const q = encodeURIComponent(query);
  return [
    { label: '网易云音乐', url: `https://music.163.com/#/search/m/?s=${q}` },
    { label: 'QQ 音乐', url: `https://y.qq.com/n/ryqq/search?w=${q}` },
    { label: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { label: 'Apple Music', url: `https://music.apple.com/us/search?term=${q}` },
  ];
}
