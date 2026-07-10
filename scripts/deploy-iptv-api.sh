#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_NAME="${IMAGE_NAME:-iptv-api:local}"
CONTAINER_NAME="${CONTAINER_NAME:-iptv-api}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/iptv-api}"
DATA_DIR="${DATA_DIR:-/home/iptv-api-data}"
HOST_PORT="${HOST_PORT:-5180}"
CONTAINER_HTTP_PORT="${CONTAINER_HTTP_PORT:-8080}"
PUBLIC_SCHEME_VALUE="${PUBLIC_SCHEME:-http}"
PUBLIC_DOMAIN_VALUE="${PUBLIC_DOMAIN:-}"
UPDATE_TIMES_VALUE="${UPDATE_TIMES:-03:10}"
TIME_ZONE_VALUE="${TIME_ZONE:-Asia/Shanghai}"
LOW_MEMORY_MODE="${LOW_MEMORY_MODE:-true}"
MEMORY_LIMIT="${MEMORY_LIMIT:-320m}"
MEMORY_SWAP="${MEMORY_SWAP:-320m}"
CLIENT_DIRECT_MODE="${CLIENT_DIRECT_MODE:-true}"
CLIENT_URLS_LIMIT="${CLIENT_URLS_LIMIT:-20}"
ZIP_FILE=""

usage() {
  cat <<'USAGE'
用法:
  bash scripts/deploy-iptv-api.sh -z /home/iptv-api-master.zip -H 服务器IP或域名

可选参数:
  -d IPTV 源码部署目录，默认 /home/iptv-api
  -D IPTV 数据目录，默认 /home/iptv-api-data
  -P 主机端口，默认 5180
  -n 容器名称，默认 iptv-api
  -i 镜像名称，默认 iptv-api:local
  -H 公网 IP 或域名，会写入 PUBLIC_DOMAIN
  -S 公网协议，默认 http
  -T IPTV 定时更新时间，默认 03:10，使用 Asia/Shanghai
  -O 是否启用低内存模式，默认 true
  -M Docker 内存限制，默认 320m
  -W Docker 内存+Swap限制，默认 320m
  -J 是否启用 JMTV 客户机直连多线路模式，默认 true
  -U JMTV 客户机直连模式下单频道保留线路数，默认 20，0 表示不限制

也可以用环境变量:
  PUBLIC_DOMAIN=服务器IP或域名 bash scripts/deploy-iptv-api.sh -z /home/iptv-api-master.zip
  CLIENT_DIRECT_MODE=true CLIENT_URLS_LIMIT=20 LOW_MEMORY_MODE=true MEMORY_LIMIT=320m MEMORY_SWAP=320m UPDATE_TIMES=03:10 PUBLIC_DOMAIN=服务器IP bash scripts/deploy-iptv-api.sh -z /home/iptv-api-master.zip
USAGE
}

while getopts ":z:d:D:P:n:i:H:S:T:O:M:W:J:U:h" opt; do
  case "$opt" in
    z) ZIP_FILE="$OPTARG" ;;
    d) DEPLOY_DIR="$OPTARG" ;;
    D) DATA_DIR="$OPTARG" ;;
    P) HOST_PORT="$OPTARG" ;;
    n) CONTAINER_NAME="$OPTARG" ;;
    i) IMAGE_NAME="$OPTARG" ;;
    H) PUBLIC_DOMAIN_VALUE="$OPTARG" ;;
    S) PUBLIC_SCHEME_VALUE="$OPTARG" ;;
    T) UPDATE_TIMES_VALUE="$OPTARG" ;;
    O) LOW_MEMORY_MODE="$OPTARG" ;;
    M) MEMORY_LIMIT="$OPTARG" ;;
    W) MEMORY_SWAP="$OPTARG" ;;
    J) CLIENT_DIRECT_MODE="$OPTARG" ;;
    U) CLIENT_URLS_LIMIT="$OPTARG" ;;
    h) usage; exit 0 ;;
    :) echo "参数 -$OPTARG 缺少值" >&2; usage; exit 1 ;;
    \?) echo "未知参数: -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$ZIP_FILE" ]]; then
  echo "缺少压缩包路径，请使用 -z /home/iptv-api-master.zip" >&2
  usage
  exit 1
fi

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "压缩包不存在: $ZIP_FILE" >&2
  exit 1
fi

if [[ -z "$PUBLIC_DOMAIN_VALUE" ]]; then
  echo "缺少公网 IP 或域名，请使用 -H 服务器IP或域名，或设置 PUBLIC_DOMAIN 环境变量" >&2
  exit 1
fi

for cmd in docker unzip mktemp python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少命令: $cmd" >&2
    exit 1
  fi
done

case "$DEPLOY_DIR" in
  ""|"/"|"/root"|"/home"|"/opt"|"/usr"|"/var")
    echo "源码部署目录过于宽泛，拒绝继续: $DEPLOY_DIR" >&2
    exit 1
    ;;
esac

case "$DATA_DIR" in
  ""|"/"|"/root"|"/home"|"/opt"|"/usr"|"/var")
    echo "数据目录过于宽泛，拒绝继续: $DATA_DIR" >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "解压 IPTV 源码压缩包: $ZIP_FILE"
unzip -q "$ZIP_FILE" -d "$TMP_DIR"

SOURCE_DIR="$TMP_DIR"
if [[ ! -f "$SOURCE_DIR/main.py" ]]; then
  FIRST_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
  if [[ -n "$FIRST_DIR" && -f "$FIRST_DIR/main.py" ]]; then
    SOURCE_DIR="$FIRST_DIR"
  fi
fi

if [[ ! -f "$SOURCE_DIR/main.py" || ! -f "$SOURCE_DIR/Dockerfile" || ! -f "$SOURCE_DIR/Pipfile" ]]; then
  echo "压缩包内未找到 IPTV API 源码根目录，请确认包含 main.py、Dockerfile、Pipfile" >&2
  exit 1
fi

echo "准备 IPTV 源码部署目录: $DEPLOY_DIR"
DEPLOY_PARENT="$(dirname "$DEPLOY_DIR")"
mkdir -p "$DEPLOY_PARENT"
rm -rf "$DEPLOY_DIR.new"
mkdir -p "$DEPLOY_DIR.new"
cp -a "$SOURCE_DIR"/. "$DEPLOY_DIR.new"/

if [[ -d "$DEPLOY_DIR" && -n "$(find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
  BACKUP_DIR="$DEPLOY_DIR.backup.$(date +%Y%m%d%H%M%S)"
  echo "备份旧 IPTV 源码目录: $BACKUP_DIR"
  mv "$DEPLOY_DIR" "$BACKUP_DIR"
elif [[ -d "$DEPLOY_DIR" ]]; then
  rmdir "$DEPLOY_DIR"
fi
mv "$DEPLOY_DIR.new" "$DEPLOY_DIR"

echo "准备 IPTV 数据目录: $DATA_DIR"
mkdir -p "$DATA_DIR/config" "$DATA_DIR/output"

CONFIG_FILE="$DATA_DIR/config/config.ini"
if [[ ! -f "$CONFIG_FILE" ]]; then
  cp "$DEPLOY_DIR/config/config.ini" "$CONFIG_FILE"
fi

python3 - "$CONFIG_FILE" "$UPDATE_TIMES_VALUE" "$TIME_ZONE_VALUE" "$LOW_MEMORY_MODE" "$CLIENT_DIRECT_MODE" "$CLIENT_URLS_LIMIT" <<'PY'
import configparser
import sys

config_path, update_times, time_zone, low_memory_mode, client_direct_mode, client_urls_limit = sys.argv[1:7]
parser = configparser.ConfigParser()
parser.optionxform = str
parser.read(config_path, encoding="utf-8")
if not parser.has_section("Settings"):
    parser.add_section("Settings")
parser.set("Settings", "update_mode", "time")
parser.set("Settings", "update_interval", "0")
parser.set("Settings", "update_times", update_times)
parser.set("Settings", "time_zone", time_zone)
client_direct_enabled = client_direct_mode.lower() not in {"false", "0", "no"}
parser.set("Settings", "open_jmtv_client_direct_mode", "True" if client_direct_enabled else "False")
parser.set("Settings", "jmtv_client_urls_limit", client_urls_limit)
if client_direct_enabled:
    client_direct_settings = {
        "open_speed_test": "False",
        "open_filter_resolution": "False",
        "open_filter_speed": "False",
        "open_filter_ad": "False",
        "open_full_speed_test": "False",
        "open_supply": "True",
        "open_auto_disable_source": "False",
        "speed_test_filter_host": "False",
        "subscribe_num": client_urls_limit if client_urls_limit != "0" else "20",
    }
    for key, value in client_direct_settings.items():
        parser.set("Settings", key, value)
if low_memory_mode.lower() not in {"false", "0", "no"}:
    low_memory_settings = {
        "open_speed_test": "False",
        "open_filter_resolution": "False",
        "open_filter_speed": "False",
        "open_filter_ad": "False",
        "open_full_speed_test": "False",
        "open_rtmp": "False",
        "open_realtime_write": "False",
        "speed_test_limit": "1",
        "speed_test_timeout": "3",
        "request_timeout": "5",
    }
    for key, value in low_memory_settings.items():
        parser.set("Settings", key, value)
with open(config_path, "w", encoding="utf-8") as file:
    parser.write(file)
PY
echo "IPTV 定时更新: $TIME_ZONE_VALUE $UPDATE_TIMES_VALUE"
if [[ "$CLIENT_DIRECT_MODE" != "false" && "$CLIENT_DIRECT_MODE" != "0" && "$CLIENT_DIRECT_MODE" != "no" ]]; then
  echo "JMTV 客户机直连多线路模式: 已开启，单频道保留 $CLIENT_URLS_LIMIT 条线路"
else
  echo "JMTV 客户机直连多线路模式: 已关闭"
fi
if [[ "$LOW_MEMORY_MODE" != "false" && "$LOW_MEMORY_MODE" != "0" && "$LOW_MEMORY_MODE" != "no" ]]; then
  echo "IPTV 低内存模式: 已开启"
else
  echo "IPTV 低内存模式: 已关闭"
fi

echo "构建 IPTV Docker 镜像: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$DEPLOY_DIR"

echo "替换旧 IPTV 容器: $CONTAINER_NAME"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "启动 IPTV API 容器"
MEMORY_ARGS=()
if [[ -n "$MEMORY_LIMIT" ]]; then
  MEMORY_ARGS+=(--memory="$MEMORY_LIMIT")
fi
if [[ -n "$MEMORY_SWAP" ]]; then
  MEMORY_ARGS+=(--memory-swap="$MEMORY_SWAP")
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  "${MEMORY_ARGS[@]}" \
  -p "$HOST_PORT:$CONTAINER_HTTP_PORT" \
  -v "$DATA_DIR/config:/iptv-api/config" \
  -v "$DATA_DIR/output:/iptv-api/output" \
  -e PUBLIC_SCHEME="$PUBLIC_SCHEME_VALUE" \
  -e PUBLIC_DOMAIN="$PUBLIC_DOMAIN_VALUE" \
  -e PUBLIC_PORT="$HOST_PORT" \
  -e NGINX_HTTP_PORT="$CONTAINER_HTTP_PORT" \
  -e CDN_URL="${CDN_URL:-}" \
  -e HTTP_PROXY="${HTTP_PROXY:-}" \
  "$IMAGE_NAME"

echo "IPTV API 部署完成"
echo "访问地址: ${PUBLIC_SCHEME_VALUE}://${PUBLIC_DOMAIN_VALUE}:${HOST_PORT}"
echo "直播 txt: ${PUBLIC_SCHEME_VALUE}://${PUBLIC_DOMAIN_VALUE}:${HOST_PORT}/txt"
echo "直播 m3u: ${PUBLIC_SCHEME_VALUE}://${PUBLIC_DOMAIN_VALUE}:${HOST_PORT}/m3u"
echo "订阅源文件: $DATA_DIR/config/subscribe.txt"
echo "查看日志: docker logs -f $CONTAINER_NAME"
