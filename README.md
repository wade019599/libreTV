# JMTV - 免费在线视频搜索与观看平台

<div align="center">
  <img src="image/logo.png" alt="JMTV Logo" width="120">
  <br>
  <p><strong>自由观影，畅享精彩</strong></p>
</div>

## 📺 项目简介

JMTV 是一个轻量级、免费的在线视频搜索与观看平台，提供来自多个视频源的内容搜索与播放服务。无需注册，即开即用，支持多种设备访问。项目结合了前端技术和后端代理功能，可部署在支持服务端功能的各类网站托管服务上。**项目门户**： [libretv.is-an.org](https://libretv.is-an.org)

本项目基于 [bestK/tv](https://github.com/bestK/tv) 进行重构与增强。

<details>
  <summary>点击查看项目截图</summary>
  <img src="https://github.com/user-attachments/assets/df485345-e83b-4564-adf7-0680be92d3c7" alt="项目截图" style="max-width:600px">
</details>

## 🚀 快速部署

选择以下任一平台，点击一键部署按钮，即可快速创建自己的 JMTV 实例：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLibreSpark%2FLibreTV)  
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/LibreSpark/LibreTV)  
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/LibreSpark/LibreTV)

## 🚨 重要声明

- 本项目仅供学习和个人使用，为避免版权纠纷，必须设置PASSWORD环境变量
- 请勿将部署的实例用于商业用途或公开服务
- 如因公开分享导致的任何法律问题，用户需自行承担责任
- 项目开发者不对用户的使用行为承担任何法律责任

## ⚠️ 同步与升级

Pull Bot 会反复触发无效的 PR 和垃圾邮件，严重干扰项目维护。作者可能会直接拉黑所有 Pull Bot 自动发起的同步请求的仓库所有者。

**推荐做法：**

建议在 fork 的仓库中启用本仓库自带的 GitHub Actions 自动同步功能（见 `.github/workflows/sync.yml`）。 

如需手动同步主仓库更新，也可以使用 GitHub 官方的 [Sync fork](https://docs.github.com/cn/github/collaborating-with-issues-and-pull-requests/syncing-a-fork) 功能。

对于更新后可能会出现的错误和异常，在设置中备份配置后，首先清除页面Cookie，然后 Ctrl + F5 刷新页面。再次访问网页检查是否解决问题。


## 📋 详细部署指南

### Cloudflare Pages

1. Fork 或克隆本仓库到您的 GitHub 账户
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 Pages 服务
3. 点击"创建项目"，连接您的 GitHub 仓库
4. 使用以下设置：
   - 构建命令：留空（无需构建）
   - 输出目录：留空（默认为根目录）
5. **⚠️ 重要：在"设置" > "环境变量"中添加 `PASSWORD` 变量（必须设置）**
6. 点击"保存并部署"

### Vercel

1. Fork 或克隆本仓库到您的 GitHub/GitLab 账户
2. 登录 [Vercel](https://vercel.com/)，点击"New Project"
3. 导入您的仓库，使用默认设置
4. **⚠️ 重要：在"Settings" > "Environment Variables"中添加 `PASSWORD` 变量（必须设置）**
5. 点击"Deploy"


### Docker
```
docker run -d \
  --name libretv \
  --restart unless-stopped \
  -p 8899:8080 \
  -e PASSWORD=your_password \
  -e SOURCE_SYNC_ENABLED=true \
  -e IPTV_API_BASE_URL=http://服务器IP:5180 \
  -e LIVE_PLAY_MODE=direct \
  bestzwei/libretv:latest
```

### Docker Compose

`docker-compose.yml` 文件：

```yaml
services:
  libretv:
    image: bestzwei/libretv:latest
    container_name: libretv
    ports:
      - "8899:8080" # 将内部 8080 端口映射到主机的 8899 端口
	    environment:
	      - PASSWORD=${PASSWORD:-111111} # 可将 111111 修改为你想要的密码，默认为 your_password
	      - SOURCE_SYNC_ENABLED=true
	      - IPTV_API_BASE_URL=http://服务器IP:5180
	      - LIVE_PLAY_MODE=direct
	    restart: unless-stopped
```
启动 JMTV：

```bash
docker compose up -d
```
访问 `http://localhost:8899` 即可使用。

### IPTV API 源码部署

直播功能依赖独立的 IPTV API 服务。可使用 `D:\work\project\iptv-api-master` 这份源码在服务器上构建部署，JMTV 通过 `IPTV_API_BASE_URL` 读取它生成的 `/txt`、`/m3u`、`/ipv4/txt`、`/ipv6/txt` 等直播列表。

推荐使用脚本从源码压缩包部署。先把 `iptv-api-master.zip` 上传到 `/home/iptv-api-master.zip`，再运行：

```bash
bash scripts/deploy-iptv-api.sh -z /home/iptv-api-master.zip -H 服务器IP或域名
```

常用完整参数：

```bash
bash scripts/deploy-iptv-api.sh \
  -z /home/iptv-api-master.zip \
  -H 服务器IP或域名 \
  -d /home/iptv-api \
  -D /home/iptv-api-data \
  -P 5180 \
  -n iptv-api \
  -i iptv-api:local \
  -T 03:10 \
  -O true \
  -M 320m \
  -W 320m \
  -J true \
  -U 20
```

脚本会完成解压、备份旧源码目录、构建镜像、创建数据目录、替换旧容器并启动服务。IPTV 默认按 `Asia/Shanghai 03:10` 定时更新，避开 JMTV 外部资源站的北京时间 `04:00` 同步；如需调整可改 `-T HH:MM`。脚本默认启用 JMTV 客户机直连多线路模式：`-J true -U 20`，即单频道最多保留 20 条备用线路，让 JMTV 客户机播放失败时自行切线。

512MB 内存服务器默认启用低内存模式，脚本会写入这些 IPTV 配置以降低 OOM 风险：

```ini
open_speed_test = False
open_filter_resolution = False
open_filter_speed = False
open_filter_ad = False
open_full_speed_test = False
open_supply = True
open_auto_disable_source = False
open_rtmp = False
open_realtime_write = False
open_jmtv_client_direct_mode = True
jmtv_client_urls_limit = 20
speed_test_limit = 1
speed_test_timeout = 3
request_timeout = 5
```

同时 Docker 默认加 `--memory=320m --memory-swap=320m`，适合无 swap 的 512MB 服务器稳定运行。如果服务器内存较大，可以用 `-O false` 关闭低内存配置，或用 `-M`、`-W` 调整限制。也可以手动执行等价 Docker 命令：

1 核 2G 服务器建议继续使用客户机直连模式，不让服务器代理直播流；IPTV API 容器可放宽到 `768m~1024m`，JMTV 侧使用轻量直播源监测，只检查 IPTV API 输出列表是否可用和频道数量，不对每条 m3u8 做服务器测速：

```bash
bash scripts/deploy-iptv-api.sh \
  -z /home/iptv-api-master.zip \
  -H 服务器IP或域名 \
  -J true \
  -U 20 \
  -M 768m \
  -W 1024m
```

JMTV 环境变量建议：

```env
LIVE_PLAY_MODE=direct
LIVE_CACHE_TTL=300000
LIVE_MONITOR_SOURCES=txt,ipv4_txt
LIVE_MONITOR_CACHE_TTL=600000
LIVE_MONITOR_TIMEOUT=8000
```

```bash
cd /home/iptv-api
docker build -t iptv-api:local .
mkdir -p /home/iptv-api-data/config /home/iptv-api-data/output
docker run -d \
  --name iptv-api \
  --restart unless-stopped \
  --memory=320m \
  --memory-swap=320m \
  -p 5180:8080 \
  -v /home/iptv-api-data/config:/iptv-api/config \
  -v /home/iptv-api-data/output:/iptv-api/output \
  -e PUBLIC_SCHEME=http \
  -e PUBLIC_DOMAIN=服务器IP或域名 \
  -e PUBLIC_PORT=5180 \
  -e NGINX_HTTP_PORT=8080 \
  iptv-api:local
```

添加订阅源：

```bash
vi /home/iptv-api-data/config/subscribe.txt
```

每行一个 txt 或 m3u 订阅地址。保存后重启容器生成结果：

```bash
docker restart iptv-api
docker logs -f iptv-api
```

验证 IPTV API：

```bash
curl http://服务器IP:5180/txt
curl http://服务器IP:5180/m3u
```

JMTV 接入直播：

```bash
docker rm -f jiumi-video
docker run -d \
  --name jiumi-video \
  --restart unless-stopped \
  -p 8899:8080 \
  --env-file .env \
  -e IPTV_API_BASE_URL=http://服务器IP:5180 \
  -e LIVE_PLAY_MODE=direct \
  jiumi-video:latest
```

访问 `http://服务器IP:8899/live`，或在首页点击“直播”。

### 本地开发环境

项目包含后端代理功能，需要支持服务器端功能的环境：

```bash
# 首先，通过复制示例来设置 .env 文件（可选）
cp .env.example .env

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:8080` 即可使用（端口可在.env文件中通过PORT变量修改）。

> ⚠️ 注意：使用简单静态服务器（如 `python -m http.server` 或 `npx http-server`）时，视频代理功能将不可用，视频无法正常播放。完整功能测试请使用 Node.js 开发服务器。

### Android 无服务器版 APK 构建

项目包含 `android-wrapper` 工程，可直接构建手机端和电视端 APK。构建任务会自动把根目录的 HTML、JavaScript、CSS、图片和本地依赖打入 APK，不需要先部署 JMTV Node、Docker、Vercel、Netlify 或网站服务器。

> 无服务器版不是完全离线版。App 启动不依赖 JMTV 服务端，但搜索、节目源或直播源同步、网络视频播放仍需访问第三方接口和媒体地址。

构建前请安装 Android Studio，或准备 JDK 17 与 Android SDK，并确认 `android-wrapper/local.properties` 中的 `sdk.dir` 指向本机 Android SDK。工程已包含 Gradle Wrapper。

Windows PowerShell：

```powershell
cd android-wrapper

# 调试包
.\gradlew.bat assemblePhoneDebug
.\gradlew.bat assembleTvDebug

# 发布包
.\gradlew.bat assemblePhoneRelease
.\gradlew.bat assembleTvRelease
```

Linux 或 macOS：

```bash
cd android-wrapper
./gradlew assemblePhoneDebug
./gradlew assembleTvDebug
./gradlew assemblePhoneRelease
./gradlew assembleTvRelease
```

无服务器版已移除旧版的 `LIBRETV_SITE_URL` 和 `LIBRETV_BACKUP_SITE_URL` 构建字段，启动入口固定为 APK 内置页面 `https://jmtv.local/`，不会回退到 JMTV 网站服务器。

APK 输出位置：

- 手机端调试包：`android-wrapper/app/build/outputs/apk/phone/debug/app-phone-debug.apk`
- 电视端调试包：`android-wrapper/app/build/outputs/apk/tv/debug/app-tv-debug.apk`
- 手机端发布包：`android-wrapper/app/build/outputs/apk/phone/release/app-phone-release.apk`
- 电视端发布包：`android-wrapper/app/build/outputs/apk/tv/release/app-tv-release.apk`

安装调试包：

```powershell
cd android-wrapper
adb install -r app/build/outputs/apk/phone/debug/app-phone-debug.apk
adb install -r app/build/outputs/apk/tv/debug/app-tv-debug.apk
```

修改网页、Android 原生代码或 TV 键盘脚本后需要重新打包并覆盖安装。构建会自动同步网页资源；如果删除或重命名过静态文件，建议先执行 `./gradlew clean` 或 `.\gradlew.bat clean`。

节目源在 App 设置的 App 手动同步区域配置，支持 JMTV 配置、包含 `{ sites: {...} }` 的配置和苹果 CMS API。APK 会打包 `iptv-api/config` 及 `iptv-api/output` 下的直播结果，首次进入直播页自动使用内置 `result.txt`；点击同步直播源且未填写自定义地址时，App 会读取包内 `config/subscribe.txt` 批量同步并合并频道，也可填写 TXT、M3U、M3U8 地址覆盖本地直播缓存。同步数据和直播源同步参数均保存在设备本地。

直播源同步参数已开放给 App 用户：

- 开启测速：默认关闭；开启后会逐条探测直播线路，请求失败或超时的线路不会写入本地缓存。
- 速率过滤：默认关闭；开启测速后，可按最小速率过滤线路，默认最小速率为 `0.1 MB/s`。
- 分辨率过滤：默认关闭；开启测速后，可按最小 `1280x720`、最大 `3840x2160` 过滤已声明分辨率的 HLS 线路。无法识别分辨率的线路会保留，避免误删有效直播源。
- 测速并发：默认 `10`，可设置 `1-20`。
- 响应超时：默认 `5` 秒，可设置 `1-60` 秒，同时用于直播源清单下载和单次线路探测。

测速会增加同步耗时、设备网络流量和 CPU 占用，因此默认关闭。参数修改后点击“保存同步参数”或直接执行“同步直播源”即可保存并应用。

电视端构建包含遥控器焦点导航和搜索屏幕键盘。当前 release 包默认使用本机 debug keystore，正式分发前应更换正式签名。完整说明见 `android-wrapper/README.md`。

### 从压缩包 Docker 部署

将项目压缩包上传到服务器后，可使用脚本完成解压、构建镜像、替换旧容器和启动服务。

先解压一次拿到部署脚本：

```bash
unzip /home/JMTV-main.zip -d /home/libretv-src
cd /home/libretv-src/JMTV-main
```

一条命令部署：

```bash
bash scripts/deploy-from-zip.sh -z /home/JMTV-main.zip -p 你的访问密码 -L http://host.docker.internal:15180 -M direct
```

常用完整参数：

```bash
bash scripts/deploy-from-zip.sh \
  -z /home/JMTV-main.zip \
  -p 你的访问密码 \
  -d /home/jiumi-video \
  -P 8899 \
  -n jiumi-video \
  -i jiumi-video:latest \
  -L http://host.docker.internal:15180 \
  -M direct
```

如果 JMTV 和 IPTV API 在同一台服务器的 Docker 中运行，推荐使用 `host.docker.internal`。脚本默认会给容器添加 `--add-host=host.docker.internal:host-gateway`，避免容器访问公网域名回环超时。

直播默认使用客户机直连模式：JMTV 只读取 IPTV API 生成的频道列表，真正的 m3u8/ts 播放流量由手机、电视或浏览器直接访问直播源。若某些设备因为源站限制无法播放，可把 `-M direct` 改成 `-M proxy`，切回服务器代理播放。

直连模式下，服务器延迟不等于客户机延迟。JMTV 会把同名频道展示为一个频道，但保留该频道的多条直播线路；客户机播放失败时会自动尝试下一条线路。建议 IPTV API 不要用服务器测速结果过滤掉大量线路，否则客户机本来能访问的线路会提前丢失。

直播播放失败时会优先在当前直播源内自动尝试下一条普通线路；当前源全部失败后，会在综合/IPv4/IPv6 等普通来源中查找同名频道继续尝试。推流线路保留为手动选择，不参与自动跨源切换，避免失败后跳入推流源导致直接播放失败。

部署完成后访问：

```text
http://服务器IP:8899
```

查看日志：

```bash
docker logs -f jiumi-video
```

## 🔧 自定义配置

### 密码保护

**重要提示**: 为确保安全，所有部署都必须设置 PASSWORD 环境变量，否则用户将看到设置密码的提示。


### API兼容性

JMTV 支持标准的苹果 CMS V10 API 格式。添加自定义 API 时需遵循以下格式：
- 搜索接口: `https://example.com/api.php/provide/vod/?ac=videolist&wd=关键词`
- 详情接口: `https://example.com/api.php/provide/vod/?ac=detail&ids=视频ID`

**添加 CMS 源**:
1. 在设置面板中选择"自定义接口"
2. 接口地址: `https://example.com/api.php/provide/vod`

### 直播功能

JMTV 新增“直播”入口，后端会请求 IPTV API 的直播列表并转换为前端频道数据。

可用接口：

```bash
curl "http://服务器IP:8899/api/live/channels"
curl "http://服务器IP:8899/api/live/channels?source=ipv4_txt"
curl "http://服务器IP:8899/api/live/channels?source=ipv6_txt"
curl "http://服务器IP:8899/api/live/channels?source=hls_txt"
curl "http://服务器IP:8899/api/live/channels?force=1"
curl "http://服务器IP:8899/api/live/monitor"
curl "http://服务器IP:8899/api/live/monitor?force=1"
curl "http://服务器IP:8899/api/live/monitor?sources=txt,ipv4_txt"
```

相关环境变量：

- `IPTV_API_BASE_URL`：IPTV API 服务地址，例如 `http://服务器IP:5180`
- `LIVE_IPTV_PATH`：默认读取路径，默认 `/txt`
- `LIVE_CACHE_TTL`：直播频道缓存时间，默认 `300000` 毫秒，即 5 分钟
- `LIVE_REQUEST_TIMEOUT`：请求 IPTV API 和直播媒体的超时时间，默认 `30000` 毫秒
- `LIVE_MONITOR_SOURCES`：轻量直播源监测范围，默认 `txt,ipv4_txt`，可选 `m3u`、`ipv6_txt`、`hls_txt`、`hls_m3u` 或 `/自定义路径`
- `LIVE_MONITOR_CACHE_TTL`：直播源监测结果缓存时间，默认 `600000` 毫秒，即 10 分钟
- `LIVE_MONITOR_TIMEOUT`：单个直播源列表监测超时时间，默认 `8000` 毫秒
- `LIVE_PLAY_MODE`：直播播放模式，默认 `direct`。`direct` 表示客户机直连直播源，`proxy` 表示通过 JMTV `/api/live/media` 代理直播流

直播默认不会经过 JMTV 服务器代理，服务器只负责获取和缓存频道列表。切换为 `proxy` 后，直播播放会通过 `/api/live/media` 做同源代理，并复用当前 PASSWORD 鉴权，适合处理部分源站 CORS 或 WebView 兼容问题。

如果 IPTV API 输出中同一频道存在多个地址，JMTV 前端只显示一个频道，并在播放失败时按客户机实际可用性自动切换备用线路。

`/api/live/monitor` 是面向低配服务器的轻量监测接口，只拉取 IPTV API 已生成的列表并统计频道数、分组数、响应时间和 HTTP 状态。它不会逐条拉流或测速，适合 1 核 2G 服务器配合定时任务、Uptime Kuma、哪吒探针等外部监控使用。至少一个监测源可用且频道数大于 0 时返回 HTTP 200；全部失败时返回 HTTP 503。

### 资源站实时同步

Node/Docker 部署会提供 `GET /api/sources/external` 接口，用于同步外部资源站。前端启动时会自动拉取该接口，并合并到资源设置列表；静态部署没有该接口时会自动跳过。

自动更新时机：

- 服务启动后会立即强制同步一次
- 服务运行期间会按北京时间每天 `04:00` 强制同步一次
- 用户访问 `/api/sources/external` 时仍会按缓存策略返回，缓存默认 6 小时

当前同步来源：

- `https://www.yszzq.com/ziyuan/webplugin/`
- `https://telegra.ph/APIs-08-12`

同步规则：

- `yszzq` 来源会实际请求候选采集地址，确认响应是 JSON 且包含 `list` 数组后才保留
- `telegra` 来源按页面里的 `API_SITES` 配置片段解析
- 每个 `yszzq` 资源站只保留 1 个可用 JSON 接口
- 两个来源合并时按 API 地址去重
- 不修改 `js/customer_site.js` 中系统自带资源

手动强制刷新：

```bash
curl "http://服务器IP:8899/api/sources/external?force=1"
```

相关环境变量：

- `SOURCE_SYNC_ENABLED`：是否启用同步，默认 `true`
- `SOURCE_SYNC_TTL`：同步缓存时间，默认 `21600000` 毫秒，即 6 小时
- `SOURCE_SYNC_LIMIT`：最多同步资源站数量，默认 `120`
- `SOURCE_SYNC_BATCH_SIZE`：并发请求批量大小，默认 `4`
- `SOURCE_SYNC_REQUEST_TIMEOUT`：同步第三方站点和采集接口的单次请求超时，默认 `30000` 毫秒；服务器访问第三方站较慢时可设为 `60000`

## ⌨️ 键盘快捷键

播放器支持以下键盘快捷键：

- **空格键**: 播放/暂停
- **左右箭头**: 快退/快进
- **上下箭头**: 音量增加/减小
- **M 键**: 静音/取消静音
- **F 键**: 全屏/退出全屏
- **Esc 键**: 退出全屏

## 🛠️ 技术栈

- HTML5 + CSS3 + JavaScript (ES6+)
- Tailwind CSS
- HLS.js 用于 HLS 流处理
- DPlayer 视频播放器核心
- Cloudflare/Vercel/Netlify Serverless Functions
- 服务端 HLS 代理和处理技术
- localStorage 本地存储

## ⚠️ 免责声明

JMTV 仅作为视频搜索工具，不存储、上传或分发任何视频内容。所有视频均来自第三方 API 接口提供的搜索结果。如有侵权内容，请联系相应的内容提供方。

本项目开发者不对使用本项目产生的任何后果负责。使用本项目时，您必须遵守当地的法律法规。

## 🤝 衍生项目

它们提供了更多丰富的自定义功能，欢迎体验~

- **[MoonTV](https://github.com/senshinya/MoonTV)**  
- **[OrionTV](https://github.com/zimplexing/OrionTV)**  

## 🥇 感谢支持

- **[Sharon](https://sharon.io)**
- **[ZMTO](https://zmto.com)**
- **[YXVM](https://yxvm.com)**  

