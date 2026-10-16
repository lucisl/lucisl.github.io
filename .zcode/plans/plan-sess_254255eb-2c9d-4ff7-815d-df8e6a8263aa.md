# RoamRadio —— roamdial.com 的 iOS APP 版（React Native + Expo）

## 结论先行
不依赖群友的服务器。数据源就是公开的 Radio Browser API + GeoNames，我们写一个脚本把它们编译成和 `api/globe` 同款的压缩快照**打进 APP**（离线可浏览），APP 内再提供「刷新目录」直接调 Radio Browser 公共接口。播放、星图、收藏、在播识别、歌词、识曲全部在客户端完成，无自建后端。

## 技术选型
- **Expo SDK 54（React Native 0.81, TypeScript）**，工程目录 `app/roam-radio/`（独立 package.json，不登记进 `scripts/build.mjs` 清单，不影响现有 GitHub Pages 构建；`.github/workflows` 不动）
- 播放：`expo-audio`（iOS 后台音频/锁屏控制；**同时挂 2 个 AudioPlayer 做预缓冲秒切**）
- 3D 星图/地球：`three.js` + `expo-gl`（GLView 里跑粒子，方案与原站几万粒子一致）
- 本地存储：`expo-sqlite`（收藏、目录缓存、收听历史，对应网页版 localStorage）
- RN 的 fetch 在 iOS 不走 CORS，可以直接读流的 ICY 元数据（网页版做不到的优势）
- 歌词：LRCLIB 公共 API（免费无 key）；识曲：ACRCloud/AudD（需注册 key，默认 12 秒 stream 截取，无 key 时降级为跳音乐 App 搜索）
- 界面中文为主，沿用仓库 zh-CN + core/app 分离 + core 可 node --test 单测的约定（core 用 `.ts` 纯逻辑，测试走 vitest 或 node --strip-types）

## 目录结构（全部新建于仓库内）
```
app/roam-radio/
├── app.config.ts            # expo-audio 后台模式、ATS 放行 http 流、scheme: roamradio、About 署名
├── scripts/build-snapshot.mjs   # 拉 Radio Browser → 压缩快照
├── assets/snapshot.json.gz      # 随包电台目录（约 34k 台）
├── src/core/                # 纯逻辑（可单测，无 RN 依赖）
│   ├── snapshot.ts          # 快照解码：tzs/genres/langs/countries/lat/lng/br/pop 索引数组
│   ├── browse.ts            # 流派/码率(≥128/192/320)/语言/国家筛选、随机掉台、附近电台、搜索
│   ├── queue.ts             # 下一站秒切：候选预缓冲顺序
│   ├── icy.ts               # ICY StreamTitle 解析（分块跳 metaint 字节）
│   ├── lyrics.ts            # LRCLIB 查询与同步歌词匹配
│   └── identify.ts          # 截取 12s 音频 → 识曲请求（key 可空则禁用）
├── src/views/               # 星图视图 / 地球视图 / 电台详情 / 播放条 / 搜索 / 收藏 / 设置 / 关于
└── test/                    # core 单测 + 快照脚本的 fixture 测试
```

## 数据管线（开发期跑，产物入库）
`build-snapshot.mjs`：`de1.api.radio-browser.info/json/stations/search?hidebroken=true` 全量拉取 → 按点击数/存活状态筛 ~35k 台 → 编码为与原站同构的索引数组（geo 精度 2 位、流派/语言取 top、热门度分桶）→ gzip 进 assets；带 `builtAt` 版本号。APP 内「刷新目录」调 Radio Browser 拉增量存 SQLite，失败静默用随包快照（应对国内访问慢）。

## 功能分期
1. **核心听台**：启动随机掉进电台、播放/暂停/音量/静音、下一站/上一站秒切预缓冲、线路不通自动换下一条、四组筛选、搜索、收藏、分享深链 `roamradio://s/<id>`、本地时间/城市展示、无账号无广告
2. **星图 + 地球**：拖拽星空、准星停留选台、缩放城市展开螺旋；地球视图贴 NASA 蓝 marble 图；低端降级为「城市列表」选台
3. **现在在播**：ICY StreamTitle 实时显示曲名 → ♡ 收藏曲名 → 跳转网易云/QQ音乐/Spotify 搜索；无元数据的台显示「识别这首歌」
4. **歌词 + 识曲**：读到曲名的台拉 LRCLIB 同步歌词；识曲接 ACRCloud/AudD（key 填在设置页，未配置时按钮隐藏）

## iOS 要点与风险
- 真机运行需 Xcode + `npx expo run:ios`；免费 Apple ID 签名 7 天需重签，TestFlight 分发需 $99 开发者账号（先按免费签名自用）
- ATS 仅对音频流放行 http（多数台无 https）；海外台国内网络可能连不上——与原站同样问题，靠多线路自动切换兜底
- 秒切在 iOS 后台受限：预缓冲只在 APP 前台生效，后台切歌接受 ~1s 延迟，iPhone 实测定标
- About 页保留 Radio Browser / GeoNames / 灵感来自 roamdial（群友作品）署名，不搬对方代码与素材，命名用「RoamRadio」以示区分

## 验证方式
`node --test` 覆盖 core（快照编解码、筛选、秒切队列、ICY 解析）；iOS 模拟器走通播放与星图（星图需真机验性能）；与网页版同参数对比筛选数量级（34,126 台 ±刷新差异）。

预计工作量：分期 1+2 为主干（约占 70%），3、4 各自独立可后置。全程不碰仓库现有 Pages 构建，`npm test && npm run build` 结果不受影响。