const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // API 接口代理
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:7586',
      changeOrigin: true,
      // 不移除 /api 前缀，因为后端接口本身带有 /api 前缀
      timeout: 600000, // 10分钟超时
      proxyTimeout: 600000,
    })
  );

  // 静态文件代理（简历文件等）
  app.use(
    '/uploads',
    createProxyMiddleware({
      target: 'http://localhost:7586',
      changeOrigin: true,
    })
  );
};
