# syntax=docker/dockerfile:1
# deepseek-harness 镜像 — 版本固化构建（由 GitHub Actions 传入 DSH_VERSION）
#
# dsh 本体在构建期从 npm 安装并固化为镜像；运行时零安装，启动秒级。
# 官方发新版 = Actions 检测到新版本号 → 构建新镜像推 Docker Hub。
ARG DSH_VERSION=latest

FROM node:24-slim

# ca-certificates: npm/HTTPS 必需；git: agent 会话常用；procps: ps 等排障工具
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git procps \
    && rm -rf /var/lib/apt/lists/*

COPY inject-polyfill.js /inject-polyfill.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# dsh + pnpm 一起装：pnpm 是 `dsh plugin` 子命令的硬依赖（CLI 转发执行）。
# --allow-scripts 放行原生依赖 postinstall（npm>=10 默认拦截，node-pty/koffi
# 不放行会装出不完整运行时，runzhliu 镜像实证清单）。
# 装完立即注入 LAN HTTP polyfill（构建期固化，运行时不用重跑）并校验版本。
ARG DSH_VERSION
RUN npm install -g "@deepseek-ai/dsh@${DSH_VERSION}" "pnpm@10" \
      --allow-scripts="@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs" \
      --no-audit --no-fund \
    && node /inject-polyfill.js \
    && echo "built with dsh $(dsh --version)" \
    && npm cache clean --force

ENV DSH_HOME=/dsh-home
WORKDIR /workspace
EXPOSE 3080

# 运行时零安装，start_period 收窄
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3080/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
