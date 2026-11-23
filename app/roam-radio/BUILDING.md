# RoamRadio iOS 出包指南

工程位置：`app/roam-radio/`（Expo SDK 58 / RN 0.88，Cloud Native Generation，`ios/` 不入库）。
所有方式都**不需要在你这台机器装 Xcode**（除方式 C）。

## 前置（一次性）

```bash
cd app/roam-radio
npm install
```

## 方式 A：朋友给 API Key，本机云构建（推荐）

朋友在他的 Apple 开发者账号里操作：
1. App Store Connect → 用户与访问 → 集成 → API → 创建 App Store Connect API（访问级别：App 管理）
2. 把 **Issuer ID / Key ID / .p8 私钥** 发过来

本机执行：
```bash
npx expo login          # 注册/登录一个免费 Expo 账号
# bundle id 用 com.fredgroup.roamradio（朋友先在 Xcode/Connect 里建好 App ID 或直接让 EAS 自动管理）
eas build -p ios --profile production
```
EAS 首次会引导登录朋友的 Apple ID 并自动创建证书/描述文件（或把 API key 配置给它）。
产物可 `eas submit -p ios` 直接进 **TestFlight**，朋友接受后手机安装。

## 方式 B：把工程给朋友，他那边构建

他有 Mac + Xcode 的话：
```bash
npm install
eas build -p ios --profile production   # 或直接 npx expo run:ios 真机调试
```

## 方式 C：免费 Apple ID 本地签（不推荐）

需要本机装 Xcode（约 15GB），签名 7 天过期。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm test` | core 纯逻辑单测（node --test，43 项） |
| `npx tsc --noEmit` | 类型检查 |
| `npm run snapshot` | 重新生成随包电台快照（需网络，GeoNames 缺失自动下载） |
| `npx expo export --platform ios` | 仅打包 JS 验证 Metro 编译，不需要任何账号 |
| `npx expo start --ios` | 模拟器预览（需 Xcode）；真机预览用开发客户端 |

## 发版前检查清单

- [ ] `app.config.ts` 的 `bundleIdentifier` 与朋友账号里的 App ID 一致
- [ ] `eas.json` production profile 的 `autoIncrement` 已开启（版本号自动递增）
- [ ] TestFlight 外部测试需填隐私政策（可先用内部测试组）
- [ ] App Store 正式上架有内容版权拒审风险（电台目录类），默认走 TestFlight
