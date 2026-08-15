# 软件介绍网站 - 部署镜像（纯 Node，无第三方依赖）
FROM node:18-alpine

WORKDIR /app

# 复制 package.json 并安装（本项目无依赖，此步仅保留规范）
COPY package.json ./
RUN npm install --omit=dev || true

# 复制全部源码
COPY . .

# 生成初始数据（若 DATA_DIR 未挂载，则写入默认 data/）
RUN node scripts/seed.js || true

EXPOSE 3000

# 部署时可挂载持久卷到 /data 并设置环境变量 DATA_DIR=/data
CMD ["node", "server.js"]
