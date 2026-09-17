#!/bin/sh
# entrypoint.sh — dsh 容器入口（镜像内版本已固化，运行时零安装）
#
# 职责只剩两件：
# 1. 把 DSH_TRUSTED_HOSTS（Lucky 外网域名）透传进 dsh 的 /api 信任围栏
# 2. 拉起 Web UI，patch 覆盖绑定 0.0.0.0（容器场景由端口映射代偿边界）
set -u

TRUSTED_ARGS=""
for h in ${DSH_TRUSTED_HOSTS:-}; do
  [ -n "$h" ] && TRUSTED_ARGS="$TRUSTED_ARGS --trusted-host $h"
done

echo "[dsh] starting $(dsh --version 2>&1 || echo '?')"
# exec：dsh 成为 PID 1，正确接收 SIGTERM 优雅退出（5 秒 drain）
exec dsh web --patch /config/host.patch.yml --no-open --port 3080 $TRUSTED_ARGS
