# JMTV Android 无服务器版构建

此目录用于构建 JMTV 手机端 APK 和电视端 APK。网页的 HTML、JavaScript、CSS、图片及本地依赖会在构建时自动复制到 APK，因此 App 启动和使用不需要部署 JMTV Node、Docker、Vercel、Netlify 或其他网站服务器。

> 无服务器版不是完全离线版。App 本身不依赖 JMTV 服务端，但搜索节目、手动同步节目源或直播源、播放网络视频时，仍需联网访问相应的第三方接口和媒体地址。

## 构建前提

1. 安装 Android Studio，或安装 JDK 17 与 Android SDK。
2. 使用 Android Studio 打开 `android-wrapper` 目录并完成首次 Gradle 同步，或手动配置 `android-wrapper/local.properties`：

```properties
sdk.dir=C:/Users/你的用户名/AppData/Local/Android/Sdk
```

3. 工程已包含 Gradle Wrapper，不需要单独安装全局 `gradle` 命令。

无服务器版已移除以下旧版服务器构建字段，即使传入同名 Gradle 参数也不会生效：

- `LIBRETV_SITE_URL`
- `LIBRETV_BACKUP_SITE_URL`

## Windows PowerShell 构建

在项目根目录执行：

```powershell
cd android-wrapper

# 手机端调试包
.\gradlew.bat assemblePhoneDebug

# 电视端调试包
.\gradlew.bat assembleTvDebug

# 手机端发布包
.\gradlew.bat assemblePhoneRelease

# 电视端发布包
.\gradlew.bat assembleTvRelease
```

## Linux 和 macOS 构建

```bash
cd android-wrapper

./gradlew assemblePhoneDebug
./gradlew assembleTvDebug
./gradlew assemblePhoneRelease
./gradlew assembleTvRelease
```

如果首次执行提示没有运行权限，先执行：

```bash
chmod +x gradlew
```

## Android Studio 构建

1. 使用 Android Studio 打开 `android-wrapper` 目录。
2. 等待 Gradle 同步完成。
3. 在 Gradle 面板执行 `app > Tasks > build > assemblePhoneDebug` 或 `assembleTvDebug`。
4. 发布构建执行 `assemblePhoneRelease` 或 `assembleTvRelease`。

## APK 输出位置

- 手机端调试包：`app/build/outputs/apk/phone/debug/app-phone-debug.apk`
- 电视端调试包：`app/build/outputs/apk/tv/debug/app-tv-debug.apk`
- 手机端发布包：`app/build/outputs/apk/phone/release/app-phone-release.apk`
- 电视端发布包：`app/build/outputs/apk/tv/release/app-tv-release.apk`

从项目根目录查看时，在上述路径前加上 `android-wrapper/`。

## 安装调试包

连接已开启 USB 调试或网络 ADB 的设备后，在 `android-wrapper` 目录执行：

```powershell
adb install -r app/build/outputs/apk/phone/debug/app-phone-debug.apk
adb install -r app/build/outputs/apk/tv/debug/app-tv-debug.apk
```

手机端和电视端使用不同的 applicationId，可以同时安装。使用 `-r` 会覆盖安装同一变体并保留 App 本地数据。

## 更新网页代码后重新打包

`app/build.gradle` 中的 `syncBundledWebAssets` 任务会在构建前自动把项目根目录中的网页资源、`iptv-api/config` 配置目录及 `iptv-api/output` 下的直播结果文件同步到 APK，无需手动复制文件。

修改以下内容后必须重新构建并安装 APK，设备上才会出现新版本：

- `index.html`、`player.html`、`watch.html` 等页面
- `js/`、`css/`、`image/`、`libs/` 下的静态资源
- `iptv-api/config` 配置或 `iptv-api/output` 直播结果文件
- Android 原生代码或 TV 键盘脚本

如果删除或重命名过静态文件，建议先清理旧构建产物再打包：

```powershell
cd android-wrapper
.\gradlew.bat clean
.\gradlew.bat assemblePhoneDebug
.\gradlew.bat assembleTvDebug
```

## App 端手动同步节目源和直播源

无服务器版不从 JMTV 服务端读取节目源或直播源。APK 会内置 `iptv-api/output/result.txt` 作为首次使用的默认直播源，同时保留 App 手动同步功能：

- 节目源：填写可访问的配置地址，支持 JMTV 配置、包含 `{ sites: {...} }` 的配置以及苹果 CMS API。
- 直播源：首次进入直播页会加载 APK 内置结果；点击“同步直播源”时，如果自定义地址留空，App 会自动读取 APK 内 `iptv-api/config/subscribe.txt` 的订阅地址并批量合并。也可填写 TXT、M3U 或 M3U8 地址，仅同步指定地址并覆盖本地缓存。

直播源区域同时提供以下同步参数：

- 开启测速：默认关闭；开启后过滤请求失败或超时的线路。
- 速率过滤：默认关闭，最小速率默认 `0.1 MB/s`。
- 分辨率过滤：默认关闭，默认范围为 `1280x720-3840x2160`。未识别到分辨率的线路会保留。
- 测速并发：默认 `10`，范围 `1-20`。
- 响应超时：默认 `5` 秒，范围 `1-60` 秒。

速率和分辨率过滤仅在开启测速后生效。测速会增加同步耗时、设备网络流量和 CPU 占用，因此默认关闭。同步结果和参数均保存在设备本地；更换设备、清除 App 数据或卸载后重新安装时，会恢复使用 APK 内置直播源，手动同步的地址和参数需要重新设置。

## 手机端与电视端差异

- `phone`：面向手机和平板，方向跟随系统。
- `tv`：声明 Leanback 电视启动入口，默认横屏，支持遥控器焦点导航和搜索屏幕键盘。

## 发布签名

当前 release 构建默认使用本机 debug keystore，便于测试安装，不适合正式分发。正式发布前应在 `app/build.gradle` 中改用自己的 release keystore，或通过 Android Studio 的 Generate Signed Bundle / APK 生成正式签名包。

可先使用 `keytool` 创建签名文件：

```powershell
keytool -genkeypair -v -keystore libretv-release.jks -alias libretv -keyalg RSA -keysize 2048 -validity 10000
```
