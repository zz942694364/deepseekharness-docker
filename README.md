# GitHub 仓库文件清单 — deepseek-harness docker 镜像

推到 GitHub（公开仓库即可，无密钥内容），Actions 每天自动检查 npm 新版本并构建推送 Docker Hub。

```
├── Dockerfile                        # 镜像定义：版本固化构建
├── entrypoint.sh                     # 容器入口：透传信任域名 + 拉起 Web UI（零安装）
├── inject-polyfill.js                # LAN HTTP 浏览器侧补丁（构建期注入，SimonQvQ 原版）
├── host.patch.yml                    # dsh 绑定 0.0.0.0 的官方 config 覆盖（容器运行时挂载）
├── .github/workflows/build.yml       # 每日构建流水线
├── docker-compose.yml                # NAS 侧部署编排（这个文件不上 GitHub 也行，NAS 本地放一份）
└── secrets.env.example               # API key 模板（NAS 本地用，别上传）
```

## 各文件职责

| 文件 | 职责 |
|---|---|
| `Dockerfile` | 构建期从 npm 安装 `@deepseek-ai/dsh@$DSH_VERSION` + pnpm（`dsh plugin` 硬依赖），`--allow-scripts` 放行 node-pty/koffi 原生依赖，构建完成即注入 polyfill 并校验版本。镜像=固化的官方版本 |
| `entrypoint.sh` | 运行时只做两件事：`DSH_TRUSTED_HOSTS` 透传进 /api 信任围栏；拉起 `dsh web`（3080，patch 覆盖绑 0.0.0.0）。启动秒级 |
| `inject-polyfill.js` | 修浏览器侧纯 HTTP 缺陷（无 crypto.randomUUID / isLoopback 误判致设置页 403）。构建期注入，来源 SimonQvQ/deepseek-harness-docker |
| `host.patch.yml` | dsh 官方禁 `--host 0.0.0.0` 旗标，此文件经官方 config 层改绑。NAS 侧挂到 `/config` |
| `build.yml` | 每天北京 04:00：查 npm latest → Docker Hub 无此 tag 才构建 → 推 `<版本>` 和 `latest` 两个 tag。版本 tag 永不覆盖=可精确回滚 |

## 上线步骤（一次性）

1. **GitHub**：本目录推成新仓库；仓库 Settings → Secrets → Actions 添加：
   - `DOCKERHUB_USERNAME`：你的 Docker Hub 用户名
   - `DOCKERHUB_TOKEN`：Docker Hub → Account Settings → Security → New Access Token（权限 Read/Write）
2. **改两处用户名**：`build.yml` 顶部 `env.IMAGE` 和 `docker-compose.yml` 的 `image:`，把 `YOUR_DOCKERHUB_USER` 换成你的 Docker Hub 用户名
3. **首次验证**：GitHub 仓库 → Actions → build → Run workflow（勾 force 或不勾都行）→ 绿勾后 Docker Hub 出现 `deepseek-harness:0.1.5-rc.1` 和 `:latest`
4. **NAS 部署**：见下

## NAS 侧部署（一次性）

```sh
# /volume1/docker/dsh/ 下放: docker-compose.yml host.patch.yml secrets.env
cp secrets.env.example secrets.env && vi secrets.env   # 填 DEEPSEEK_API_KEY
docker compose up -d
docker logs -f dsh        # 应见 "[dsh] starting 0.1.5-rc.1"，秒级启动
# 内网验证: http://NAS_IP:3088 → 设置页能进、跑通一轮对话
```

## 日常更新流（你设计的方式）

1. 官方发新版 → 次日 Actions 自动构建推送 Docker Hub
2. NAS 的 Docker 管理界面提示 `latest` 有更新
3. 你确认升级 → UI 点更新（或 SSH `docker compose pull && docker compose up -d`）
4. 数据都在 `./home` 卷，升级不丢；出问题把 compose 的 `:latest` 改成旧版本号 `up -d` 回滚

## 外网访问（Lucky，一次性）

1. Lucky → Web 服务 → HTTPS 规则 → 加子规则：前端=你的域名，后端=`http://NAS_IP:3088`
2. 子规则 **定制模式→安全设置→开启基本认证(BasicAuth)**（dsh Web 零认证，这道门不可省）
3. 域名填入 NAS 侧 compose 的 `DSH_TRUSTED_HOSTS`，`docker compose up -d` 生效
