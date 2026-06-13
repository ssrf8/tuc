const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const express = require("express");
const multer = require("multer");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp"
]);

async function ensureDataFiles() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await fs.access(POSTS_FILE);
  } catch {
    await fs.writeFile(POSTS_FILE, "[]\n", "utf8");
  }
}

async function readPosts() {
  await ensureDataFiles();
  const raw = await fs.readFile(POSTS_FILE, "utf8");
  return JSON.parse(raw || "[]");
}

async function writePosts(posts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${POSTS_FILE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, POSTS_FILE);
}

function safeUploadName(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    cb(null, safeUploadName(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 50
  },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("只允许上传图片文件"));
  }
});

app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOAD_DIR, {
  fallthrough: false,
  maxAge: "7d"
}));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/posts", async (_req, res, next) => {
  try {
    const posts = await readPosts();
    posts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(posts);
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:postId", async (req, res, next) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.id === req.params.postId);

    if (!post) {
      res.status(404).json({ error: "帖子不存在" });
      return;
    }

    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();

    if (!title) {
      res.status(400).json({ error: "帖子标题不能为空" });
      return;
    }

    const now = new Date().toISOString();
    const post = {
      id: crypto.randomUUID(),
      title,
      description,
      images: [],
      createdAt: now,
      updatedAt: now
    };

    const posts = await readPosts();
    posts.unshift(post);
    await writePosts(posts);
    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:postId", async (req, res, next) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.id === req.params.postId);

    if (!post) {
      res.status(404).json({ error: "帖子不存在" });
      return;
    }

    await Promise.all(post.images.map((image) => {
      const filePath = path.join(UPLOAD_DIR, image.filename);
      return fs.unlink(filePath).catch(() => {});
    }));

    await writePosts(posts.filter((item) => item.id !== post.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:postId/images", upload.array("images", 50), async (req, res, next) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.id === req.params.postId);

    if (!post) {
      await Promise.all((req.files || []).map((file) => fs.unlink(file.path).catch(() => {})));
      res.status(404).json({ error: "帖子不存在" });
      return;
    }

    const now = new Date().toISOString();
    const images = (req.files || []).map((file) => ({
      id: crypto.randomUUID(),
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      url: `/uploads/${encodeURIComponent(file.filename)}`,
      createdAt: now
    }));

    post.images.push(...images);
    post.updatedAt = now;
    await writePosts(posts);
    res.status(201).json({ images });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:postId/images/:imageId", async (req, res, next) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.id === req.params.postId);

    if (!post) {
      res.status(404).json({ error: "帖子不存在" });
      return;
    }

    const image = post.images.find((item) => item.id === req.params.imageId);

    if (!image) {
      res.status(404).json({ error: "图片不存在" });
      return;
    }

    post.images = post.images.filter((item) => item.id !== image.id);
    post.updatedAt = new Date().toISOString();
    await fs.unlink(path.join(UPLOAD_DIR, image.filename)).catch(() => {});
    await writePosts(posts);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: `上传失败：${error.message}` });
    return;
  }

  res.status(500).json({ error: error.message || "服务器错误" });
});

ensureDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Image posts app listening on port ${PORT}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
