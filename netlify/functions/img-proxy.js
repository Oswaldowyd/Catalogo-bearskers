/**
 * img-proxy.js — Netlify Function
 * Proxy de imágenes Yupoo. Agrega el header Referer necesario para evitar el bloqueo 403.
 * Uso: /.netlify/functions/img-proxy?url=https://photo.yupoo.com/...
 */

const https = require('https');
const http  = require('http');

const ALLOWED_HOSTS = ['photo.yupoo.com', 'ptshunfeng.x.yupoo.com'];
const REFERER       = 'https://ptshunfeng.x.yupoo.com/';
const UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

exports.handler = async (event) => {
  const rawUrl = event.queryStringParameters && event.queryStringParameters.url;

  if (!rawUrl) {
    return { statusCode: 400, body: 'Falta el parámetro url' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return { statusCode: 400, body: 'URL inválida' };
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return { statusCode: 403, body: 'Host no permitido' };
  }

  return new Promise((resolve) => {
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(rawUrl, {
      headers: {
        'Referer':          REFERER,
        'User-Agent':       UA,
        'Accept':           'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language':  'zh-CN,zh;q=0.9,es;q=0.8',
      }
    }, (res) => {
      // Seguir redirecciones manualmente (máx 3)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const loc = res.headers.location;
        const newLib = loc.startsWith('https') ? https : http;
        newLib.get(loc, { headers: { 'Referer': REFERER, 'User-Agent': UA } }, (res2) => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => {
            resolve({
              statusCode:      res2.statusCode,
              headers:         { 'Content-Type': res2.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
              body:            Buffer.concat(chunks).toString('base64'),
              isBase64Encoded: true,
            });
          });
        }).on('error', (e) => resolve({ statusCode: 502, body: e.message }));
        return;
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode:      res.statusCode,
          headers:         { 'Content-Type': res.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
          body:            Buffer.concat(chunks).toString('base64'),
          isBase64Encoded: true,
        });
      });
    });

    req.on('error', (e) => resolve({ statusCode: 502, body: e.message }));
  });
};
