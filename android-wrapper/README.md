# JMTV Android 包装工程

此目录用于把已部署的 JMTV 网站封装为 Android APK，包含手机版与电视端两个构建变体。

## 前提

1. 先把 JMTV 部署到支持服务端代理的环境，例如 Docker、Vercel、Netlify、Render。
2. 确认网站可以正常访问、搜索和播放。项目依赖 `/proxy/` 与服务端密码注入，直接把静态文件放进 APK 会导致功能不完整。
3. 安装 Android Studio 或 Android SDK。本目录已包含 Gradle Wrapper，不需要单独安装全局 `gradle` 命令。

## Android Studio 构建

1. 使用 Android Studio 打开 `android-wrapper` 目录。
2. 等待 Gradle 同步完成。
3. 在 `Gradle` 面板中执行 `app > Tasks > build > assemblePhoneDebug` 或 `assembleTvDebug`。
4. 发布时执行 `assemblePhoneRelease` 或 `assembleTvRelease`，并按 Android Studio 提示签名。

如需修改网站地址，在 Android Studio 的 Gradle 参数中加入：

```text
-PLIBRETV_SITE_URL=https://你的域名
```

如需同时内置主线和备用地址，再加入：

```text
-PLIBRETV_BACKUP_SITE_URL=https://你的备用域名
```

配置备用地址后，App 默认加载主线；用户可在网页右上角“设置”面板的“App线路”中手动切换主线或备用线，选择会保存到 App 本地并立即重新加载对应线路；如果当前加载主线且主线入口失败，App 会静默自动切到备用线。

网页功能改动需要先同步到主线/备用服务器，APK 只保存访问地址，不内置网页代码。重新打包时可传入 `LIBRETV_APP_BUILD` 换一个值，用于刷新 WebView 入口缓存。

黑屏或只显示 Android 图标时，通常是 APK 内的网站地址不可访问或构建时没有传入自己的站点地址。先在手机浏览器打开同一个地址确认能访问，再重新构建 APK。

示例：

```powershell
.\gradlew.bat assemblePhoneRelease -PLIBRETV_SITE_URL=http://服务器IP:8899
.\gradlew.bat assembleTvRelease -PLIBRETV_SITE_URL=http://服务器IP:8899
```

双地址示例：

```powershell
.\gradlew.bat assemblePhoneRelease -PLIBRETV_SITE_URL=http://主线IP:8899 -PLIBRETV_BACKUP_SITE_URL=http://备用IP:8899 -PLIBRETV_APP_BUILD=20260709
.\gradlew.bat assembleTvRelease -PLIBRETV_SITE_URL=http://主线IP:8899 -PLIBRETV_BACKUP_SITE_URL=http://备用IP:8899 -PLIBRETV_APP_BUILD=20260709
```

未传入时默认加载 `https://libretv.is-an.org`。

App 端 WebView 使用系统默认缓存策略，不会在每次启动时清除缓存；入口地址会带上 `LIBRETV_APP_BUILD` 参数。未手动传入时，Gradle 会自动使用当前时间生成该值，所以原打包命令不需要改变；如需固定版本，也可手动传入 `-PLIBRETV_APP_BUILD=20260709-1`。配置备用地址后不会弹出启动选择框，默认主线，用户在设置面板手动切换备用线；主线入口失败时会自动切到备用线。

如果重新部署后只有部分界面变化，例如黄色过滤按钮消失但 `/我爱你` 不显示，通常是 HTML 已更新但 JS/CSS 仍命中旧缓存。请确认服务器已同步最新代码并重启服务；服务端会自动给本地静态资源加 `jmtv_asset` 版本参数，也可通过环境变量 `ASSET_VERSION=20260709-1` 手动指定。

## 命令行构建

在 `android-wrapper` 目录执行：

```bash
./gradlew assemblePhoneRelease -PLIBRETV_SITE_URL=https://你的域名
./gradlew assembleTvRelease -PLIBRETV_SITE_URL=https://你的域名
```

Windows PowerShell：

```powershell
.\gradlew.bat assemblePhoneRelease -PLIBRETV_SITE_URL=https://你的域名
.\gradlew.bat assembleTvRelease -PLIBRETV_SITE_URL=https://你的域名
```

生成文件位置：

- 手机端：`app/build/outputs/apk/phone/release/app-phone-release.apk`
- 电视端：`app/build/outputs/apk/tv/release/app-tv-release.apk`

## 调试构建

```powershell
.\gradlew.bat assemblePhoneDebug -PLIBRETV_SITE_URL=https://你的域名
.\gradlew.bat assembleTvDebug -PLIBRETV_SITE_URL=https://你的域名
```

调试包可直接安装测试：

```powershell
adb install -r app/build/outputs/apk/phone/debug/app-phone-debug.apk
adb install -r app/build/outputs/apk/tv/debug/app-tv-debug.apk
```

## 签名发布

当前 release 包默认使用本机 debug keystore 签名，便于测试安装。正式分发请改用自己的 release keystore，可用 Android Studio 生成签名，也可使用命令行：

```powershell
keytool -genkeypair -v -keystore libretv-release.jks -alias libretv -keyalg RSA -keysize 2048 -validity 10000
apksigner sign --ks libretv-release.jks --ks-key-alias libretv app/build/outputs/apk/phone/release/app-phone-release.apk
apksigner sign --ks libretv-release.jks --ks-key-alias libretv app/build/outputs/apk/tv/release/app-tv-release.apk
```

## 差异说明

- `phone`：普通手机/平板启动图标，默认跟随系统方向。
- `tv`：声明 Leanback 启动入口，默认横屏，适配电视桌面和遥控器返回键。
- 两个版本都使用 Android WebView 加载部署后的网站地址，不在 APK 内运行 Node 服务。

