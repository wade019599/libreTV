#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_NAME="${IMAGE_NAME:-jiumi-video:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-jiumi-video}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/jiumi-video}"
HOST_PORT="${HOST_PORT:-8899}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"
PASSWORD_VALUE="${PASSWORD:-}"
IPTV_API_BASE_URL_VALUE="${IPTV_API_BASE_URL:-}"
LIVE_PLAY_MODE_VALUE="${LIVE_PLAY_MODE:-direct}"
ADD_HOST_GATEWAY="${ADD_HOST_GATEWAY:-true}"
ZIP_FILE=""

usage() {
  cat <<'USAGE'
用法:
  bash scripts/deploy-from-zip.sh -z /path/JMTV-main.zip -p 你的访问密码 -L http://服务器IP:5180

可选参数:
  -d 部署目录，默认 /home/jiumi-video
  -P 主机端口，默认 8899
  -n 容器名称，默认 jiumi-video
  -i 镜像名称，默认 jiumi-video:latest
  -L IPTV API 地址，例如 http://服务器IP:5180
  -M 直播播放模式，direct 客户机直连，proxy 服务器代理，默认 direct
  -G 是否添加 host.docker.internal 到宿主机网关，默认 true

也可以用环境变量:
  PASSWORD=你的访问密码 DEPLOY_DIR=/home/jiumi-video HOST_PORT=8899 bash scripts/deploy-from-zip.sh -z /path/app.zip
  IPTV_API_BASE_URL=http://服务器IP:5180 PASSWORD=你的访问密码 bash scripts/deploy-from-zip.sh -z /path/app.zip
  LIVE_PLAY_MODE=proxy IPTV_API_BASE_URL=http://服务器IP:5180 PASSWORD=你的访问密码 bash scripts/deploy-from-zip.sh -z /path/app.zip
  IPTV_API_BASE_URL=http://host.docker.internal:15180 ADD_HOST_GATEWAY=true PASSWORD=你的访问密码 bash scripts/deploy-from-zip.sh -z /path/app.zip
USAGE
}

while getopts ":z:p:d:P:n:i:L:M:G:h" opt; do
  case "$opt" in
    z) ZIP_FILE="$OPTARG" ;;
    p) PASSWORD_VALUE="$OPTARG" ;;
    d) DEPLOY_DIR="$OPTARG" ;;
    P) HOST_PORT="$OPTARG" ;;
    n) CONTAINER_NAME="$OPTARG" ;;
    i) IMAGE_NAME="$OPTARG" ;;
    L) IPTV_API_BASE_URL_VALUE="$OPTARG" ;;
    M) LIVE_PLAY_MODE_VALUE="$OPTARG" ;;
    G) ADD_HOST_GATEWAY="$OPTARG" ;;
    h) usage; exit 0 ;;
    :) echo "参数 -$OPTARG 缺少值" >&2; usage; exit 1 ;;
    \?) echo "未知参数: -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$ZIP_FILE" ]]; then
  echo "缺少压缩包路径，请使用 -z /path/app.zip" >&2
  usage
  exit 1
fi

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "压缩包不存在: $ZIP_FILE" >&2
  exit 1
fi

if [[ -z "$PASSWORD_VALUE" ]]; then
  echo "缺少 PASSWORD，请使用 -p 你的访问密码，或设置 PASSWORD 环境变量" >&2
  exit 1
fi

case "$LIVE_PLAY_MODE_VALUE" in
  direct|proxy) ;;
  *)
    echo "LIVE_PLAY_MODE 只能是 direct 或 proxy，当前值: $LIVE_PLAY_MODE_VALUE" >&2
    exit 1
    ;;
esac

for cmd in docker unzip mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少命令: $cmd" >&2
    exit 1
  fi
done

case "$DEPLOY_DIR" in
  ""|"/"|"/root"|"/home"|"/opt"|"/usr"|"/var")
    echo "部署目录过于宽泛，拒绝继续: $DEPLOY_DIR" >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "解压压缩包: $ZIP_FILE"
unzip -q "$ZIP_FILE" -d "$TMP_DIR"

SOURCE_DIR="$TMP_DIR"
if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
  FIRST_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
  if [[ -n "$FIRST_DIR" && -f "$FIRST_DIR/package.json" ]]; then
    SOURCE_DIR="$FIRST_DIR"
  fi
fi

if [[ ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/Dockerfile" ]]; then
  echo "压缩包内未找到 package.json 或 Dockerfile，请确认压缩包内容是项目根目录" >&2
  exit 1
fi

echo "准备部署目录: $DEPLOY_DIR"
DEPLOY_PARENT="$(dirname "$DEPLOY_DIR")"
mkdir -p "$DEPLOY_PARENT"
rm -rf "$DEPLOY_DIR.new"
mkdir -p "$DEPLOY_DIR.new"
cp -a "$SOURCE_DIR"/. "$DEPLOY_DIR.new"/

cat > "$DEPLOY_DIR.new/.env" <<EOF_ENV
PORT=$CONTAINER_PORT
PASSWORD=$PASSWORD_VALUE
DEBUG=false
CORS_ORIGIN=*
REQUEST_TIMEOUT=8000
MAX_RETRIES=2
CACHE_MAX_AGE=1d
IPTV_API_BASE_URL=$IPTV_API_BASE_URL_VALUE
LIVE_IPTV_PATH=${LIVE_IPTV_PATH:-/txt}
LIVE_CACHE_TTL=${LIVE_CACHE_TTL:-300000}
LIVE_REQUEST_TIMEOUT=${LIVE_REQUEST_TIMEOUT:-30000}
LIVE_PLAY_MODE=$LIVE_PLAY_MODE_VALUE
BLOCKED_HOSTS=localhost,127.0.0.1,0.0.0.0,::1
BLOCKED_IP_PREFIXES=192.168.,10.,172.
FILTERED_HEADERS=content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin
EOF_ENV

if [[ -d "$DEPLOY_DIR" && -n "$(find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
  BACKUP_DIR="$DEPLOY_DIR.backup.$(date +%Y%m%d%H%M%S)"
  echo "备份旧版本: $BACKUP_DIR"
  mv "$DEPLOY_DIR" "$BACKUP_DIR"
elif [[ -d "$DEPLOY_DIR" ]]; then
  rmdir "$DEPLOY_DIR"
fi
mv "$DEPLOY_DIR.new" "$DEPLOY_DIR"

echo "构建 Docker 镜像: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$DEPLOY_DIR"

echo "替换旧容器: $CONTAINER_NAME"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "启动容器"
ADD_HOST_ARGS=()
if [[ "$ADD_HOST_GATEWAY" != "false" && "$ADD_HOST_GATEWAY" != "0" && "$ADD_HOST_GATEWAY" != "no" ]]; then
  ADD_HOST_ARGS=(--add-host=host.docker.internal:host-gateway)
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  "${ADD_HOST_ARGS[@]}" \
  --env-file "$DEPLOY_DIR/.env" \
  "$IMAGE_NAME"

echo "部署完成"
echo "访问地址: http://服务器IP:$HOST_PORT"
echo "查看日志: docker logs -f $CONTAINER_NAME"

