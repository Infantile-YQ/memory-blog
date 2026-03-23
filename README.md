# Memory Blog

一个支持注册登录、文章管理、个性化设置、二维码入口和本地备份的个人博客系统。

## 本地运行

```bash
python main.py
```

打开 `http://127.0.0.1:8000`。

## 数据存储

- 主存储：`SQLite`
- 本地备份：`data/blog_backup.json`
- 默认数据库：`data/blog.db`

可通过环境变量修改数据目录：

```bash
BLOG_DATA_DIR=/your/data/path
```

## 部署准备

项目已经支持平台注入端口：

- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `8000`
- `BLOG_DATA_DIR`：数据目录，部署时建议挂载到持久化磁盘

## Docker 部署

构建镜像：

```bash
docker build -t memory-blog .
```

运行容器：

```bash
docker run -p 8000:8000 -v memory_blog_data:/app/data memory-blog

## Docker Compose 部署

启动：

```bash
docker compose up -d --build
```

停止：

```bash
docker compose down
```

数据会保存在 Docker 卷 `memory_blog_data` 中。

## 云服务器部署步骤

1. 准备一台带公网 IP 的 Linux 云服务器
2. 安装 Docker 和 Docker Compose
3. 把项目上传到服务器
4. 执行 `docker compose up -d --build`
5. 打开服务器安全组或防火墙的 `8000` 端口
6. 如果你有域名，把域名解析到服务器公网 IP
7. 用域名访问网站后，在“网站入口”里填入最终公网 URL

## 生产环境建议

- 不要直接长期暴露 `8000` 端口给公网，建议前面加 Nginx 或 Caddy
- `BLOG_DATA_DIR` 必须放在持久化磁盘或 Docker 卷中
- 如果迁移服务器，把数据库文件和 JSON 备份一起带走
- 你当前项目使用 SQLite，适合个人博客和轻量访问场景
- 如果后期访问量明显变大，再考虑切换到 MySQL 或 PostgreSQL
```

## 公网部署要点

如果你要二维码和链接长期可用，部署平台需要满足两点：

1. 能提供固定公网 URL
2. 能挂载持久化存储目录给 `BLOG_DATA_DIR`

部署完成后，在网站里的“网站入口”中填入最终公网 URL，页面会自动生成对应二维码。
