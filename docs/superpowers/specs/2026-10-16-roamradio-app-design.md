# RoamRadio —— roamdial.com 的 iOS APP 版设计（React Native + Expo）

日期：2026-10-16　状态：已实现（core 43 测试全绿 / tsc 无错 / Metro export 通过；待真机验证）
参照物：https://roamdial.com （群友作品，网页版随机电台星图浏览器）

## 结论

不依赖 roamdial 的服务器。数据源头是公开的 Radio Browser API + GeoNames，
用脚本编译成与网页版 `api/globe` 同构的压缩快照打进 APP（离线可浏览），
APP 内提供「刷新目录」直接调 Radio Browser 公共接口。播放、星图、收藏、
在播识别、歌词、识曲全部在客户端完成，无自建后端、无账号、无广告。

## 技术选型

- Expo SDK 58（React Native 0.88, React 19, TypeScript），工程目录 `app/roam-radio/`
  （独立 package.json，不登记进根 `scripts/build.mjs` 清单，不影响 GitHub Pages 构建）
- 播放：`expo-audio`（iOS 后台音频/锁屏；挂 2 个 AudioPlayer 做下一站预缓冲秒切）
- 3D 星图/地球：`three.js` + `@react-three/fiber` + `expo-gl`（点云粒子，同网页版方案）
- 本地存储：`expo-sqlite`（收藏、刷新缓存、设置）
- ICY 在播元数据：`react-native-fetch-api`（iOS 上支持流式响应体，RN 原生 fetch 不支持）
- 歌词：LRCLIB 公共 API（免费无 key）；识曲：ACRCloud/AudD（设置页填 key，未填则隐藏入口）
- 界面中文；沿用仓库「core 纯逻辑 + app 胶水 + node --test 单测」约定
  （Node 24 原生跑 TS type-stripping）

## 打包与分发

用户机器无 Xcode。走 Expo 云构建（EAS）：

1. 朋友的付费 Apple 开发者账号注册 App ID（bundle id 默认 `com.fredgroup.roamradio`，可改）
2. 两种方式出包：
   - 朋友生成 App Store Connect API Key 给我们，本地跑 `eas build -p ios`（免装 Xcode）
   - 或把工程交给朋友，在他的电脑跑 `easc build --profile production -p ios`
3. 分发默认 TestFlight（社区电台目录类 App 上 App Store 审核风险高：内容版权）

## 目录结构

```
app/roam-radio/
├── app.config.ts              # 后台音频 UIBackgroundModes、ATS、scheme roamradio
├── eas.json                   # development / preview / production 构建配置
├── scripts/build-snapshot.mjs # Radio Browser → 压缩快照（含 GeoNames 地名配对）
├── assets/snapshot.json.gz    # 随包电台目录（约 35k 台）
├── src/core/                  # 纯逻辑（无 RN 依赖，node --test 直测）
│   ├── snapshot.ts            # 编解码：索引数组（tzs/genres/langs/countries/lat/lng/br/pop）
│   ├── browse.ts              # 筛选（流派/码率/语言/国家）、随机掉台、附近、搜索
│   ├── queue.ts               # 秒切候选队列、上一站历史、自动换线路
│   ├── icy.ts                 # ICY StreamTitle 解析（metaint 分块）
│   ├── lyrics.ts              # LRCLIB 查询 + 同步歌词行定位
│   └── identify.ts            # 截流 12s → ACRCloud(md5签名)/AudD 请求体构造
├── src/audio/engine.ts        # expo-audio 双播放器引擎（app 层胶水）
├── src/store/db.ts            # expo-sqlite：favorites / directory_cache / settings
├── src/views/                 # StarfieldView GlobeView StationScreen SearchSheet
│                              # FiltersSheet SavedSheet SettingsSheet AboutSheet
├── src/AppRoot.tsx            # 状态编排（视图切换/筛选态/播放态）
└── test/                      # core 单测 + 快照 fixture
```

## 快照数据管线（开发期）

1. `GET de1.api.radio-browser.info/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=60000`
2. 去重（name+url 归一）、坐标配对：`state` 字符串模糊匹配 GeoNames admin1CodesASCII
   质心；失败回退国家质心（countryInfo + cities15000 首都坐标）
3. 编码为列式索引数组（流派/语言/国家取字典、geo 两位小数、热门度分桶），
   JSON.stringify + gzip → `assets/snapshot.json.gz`（目标 < 2MB）
4. 带 `builtAt` 版本号；APP 内刷新拉同接口存 SQLite，失败静默用随包快照

## 功能分期

1. **核心听台**：随机掉台、播放/暂停/音量/静音、下一站/上一站秒切预缓冲、
   线路不通自动换下一条、四组筛选、搜索、收藏、分享深链 `roamradio://s/<id>`、
   当地时间/城市展示
2. **星图 + 地球**：拖拽星空、准星停留选台、缩放聚类展开；地球视图；
   低端降级为城市列表选台
3. **现在在播**：ICY StreamTitle 实时显示 → ♡ 收藏曲名 → 跳网易云/QQ音乐/Spotify 搜索
4. **歌词 + 识曲**：LRCLIB 同步歌词；ACRCloud/AudD 12 秒截流识别（key 可空降级）

## 已知风险

- 海外台在国内网络可能连不上/慢（与网页版相同），靠多线路自动切换兜底
- 秒切预缓冲仅前台有效，后台切歌接受 ~1s 延迟，iPhone 实测定标
- `react-native-fetch-api` 年久失修，隔离在 ICY 读取路径后，失败仅影响在播显示
- App Store 正式上架有版权拒审风险，默认 TestFlight 分发

## 署名

About 页注明：电台目录数据来自社区维护的 Radio Browser（开放数据）、地点来自
GeoNames、交互灵感来自 roamdial。不搬运 roamdial 的代码与素材，命名 RoamRadio 以示区分。
