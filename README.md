# 软件介绍网站（可实时更新内容）

一个用于展示「软件清单」的网站。**后端用纯 Node.js（零第三方依赖）**，数据存在单个 JSON 文件里，
你可以通过「管理后台」随时增删改软件内容，**保存后立即在前台生效**（前台通过 SSE 自动刷新，无需手动刷新）。

## 目录结构

```
site/
├── server.js            # 后端服务（纯 Node，无需 npm install）
├── package.json
├── data/
│   ├── softwares.json   # 软件数据（唯一数据源，自动生成/更新）
│   └── settings.json     # 站点标题/副标题/页脚
├── public/              # 前端（静态文件）
│   ├── index.html        # 公开网站
│   ├── admin.html        # 管理后台
│   ├── css/  js/
└── scripts/
    └── seed.js          # 从两份 Markdown 重新生成 softwares.json
```

## 启动

需要 Node.js 18+（本项目自带 Node 22 运行环境）。

```bash
cd site
node server.js
# 或： npm start
```

启动后：

- 公开网站： http://localhost:3000/
- 管理后台： http://localhost:3000/admin

可选环境变量：

```bash
PORT=8080 node server.js                 # 自定义端口
ADMIN_PASSWORD=你的密码 node server.js   # 给管理后台加密码（生产环境建议设置）
```

> 不设 `ADMIN_PASSWORD` 时管理后台本地直接开放，仅适合本机/内网使用。

## 如何实时更新内容

1. 浏览器打开 `/admin`（管理后台）。
2. 点「+ 新增软件」或某条记录的「编辑」，填写名称、分类、版本、简介、详细功能、原文链接等。
3. 点「保存」——数据写入 `data/softwares.json`，公开网站**自动刷新**显示最新内容。
4. 「站点设置」标签可修改网站标题 / 副标题 / 页脚，同样实时生效。

所有内容都存在 `site/data/` 下的 JSON 文件里，你可以直接备份、复制、迁移这些文件。

## 从 Markdown 重新生成数据

若你更新了工作区里的两份源文件（`软件汇总.md` / `软件清单汇总.md`），可重新抽取：

```bash
node scripts/seed.js
```

脚本会重新生成 `data/softwares.json`（保留你通过后台手工新增、且 `source:"manual"` 的条目）。

## 部署到公网

本项目是「静态前端 + Node 后端」，需部署到**支持 Node 运行时的环境**（纯静态托管如 GitHub Pages 放上去后台编辑/实时刷新不可用）。
数据写在 `DATA_DIR`（默认 `data/`）下的 JSON 里。**注意：免费 PaaS 的文件系统通常是临时的，重新部署会清空编辑内容**——要做到后台编辑长期保留，请用带持久磁盘的平台（或任意云服务器）。

### 通用环境变量

```bash
PORT=3000                  # 监听端口（平台一般自动注入）
ADMIN_PASSWORD=你的密码     # 公网务必设置，否则后台裸奔
DATA_DIR=/data             # 指向持久磁盘/挂载卷，保留编辑内容
```

### 方式一：Render（最快拿到公网地址）

1. 把 `site/` 推到 GitHub 仓库。
2. Render 控制台 → New → Blueprint → 关联仓库（会自动读取 `render.yaml`）。
3. 在环境变量里填 `ADMIN_PASSWORD`（必填）。
4. 免费版会休眠且**不挂磁盘，编辑内容在重新部署后可能丢失**；要持久化请升级 Starter 及以上并保留 `render.yaml` 里的 `disk` 配置。
5. 部署完成得到 `https://xxx.onrender.com`，访问 `/` 和 `/admin`。

### 方式二：云服务器 / VPS（推荐，编辑内容永久保留，国内访问快）

以腾讯云/阿里云「轻量应用服务器」为例（需自备服务器 + 域名，国内 80/443 需 ICP 备案）：

```bash
# 1) 把 site/ 传到服务器，安装 Node 18+
# 2) 启动（建议用 pm2 守护）
npm install -g pm2
cd site
ADMIN_PASSWORD=你的密码 pm2 start server.js --name software-site
pm2 save && pm2 startup

# 3) Nginx 反代 + HTTPS（certbot 申请免费证书）
#    server { listen 80; server_name 你的域名;
#      location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; } }
```

### 方式三：Docker（任意支持容器的云平台）

```bash
docker build -t software-site .
# 挂载持久卷到 /data，并设置 DATA_DIR=/data
docker run -d -p 3000:3000 \
  -e ADMIN_PASSWORD=你的密码 -e DATA_DIR=/data \
  -v software-data:/data --name software-site software-site
```

### 方式四：Railway / Koyeb / Fly.io

均支持 Node + 自动识别 `package.json` / `Procfile`。连接 GitHub 仓库后设置 start command 为 `node server.js`、加上 `ADMIN_PASSWORD`，并按平台文档挂载持久卷（对应 `DATA_DIR`）。Railway/Fly 免费版需绑定信用卡。

> 小贴士：国内用户优先选「云服务器」方案，访问稳定且编辑内容不会丢；海外临时演示用 Render 最快。无论哪种，公网都请设置 `ADMIN_PASSWORD` 并尽量启用 HTTPS。
