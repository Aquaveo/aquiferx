import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function saveDataPlugin(): Plugin {
  return {
    name: 'save-data',
    buildStart() {
      // Generate public/data/regions.json so it's available as a static file
      // in both dev (served from public/) and production builds (copied to dist/).
      const dataDir = path.resolve(__dirname, 'public/data');
      if (!fs.existsSync(dataDir)) return;
      const entries = fs.readdirSync(dataDir, { withFileTypes: true });
      const regions: any[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const regionJsonPath = path.join(dataDir, entry.name, 'region.json');
        if (fs.existsSync(regionJsonPath)) {
          try {
            regions.push(JSON.parse(fs.readFileSync(regionJsonPath, 'utf-8')));
          } catch { /* skip malformed region.json */ }
        }
      }
      fs.writeFileSync(path.join(dataDir, 'regions.json'), JSON.stringify(regions));
    },
    configureServer(server) {
      // GET /api/regions — scan public/data/ subdirectories for region.json
      server.middlewares.use('/api/regions', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          const dataDir = path.resolve(__dirname, 'public/data');
          const entries = fs.readdirSync(dataDir, { withFileTypes: true });
          const regions: any[] = [];
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const regionJsonPath = path.join(dataDir, entry.name, 'region.json');
            if (fs.existsSync(regionJsonPath)) {
              try {
                const meta = JSON.parse(fs.readFileSync(regionJsonPath, 'utf-8'));
                regions.push(meta);
              } catch (e) {
                // skip malformed region.json
              }
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(regions));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      // POST /api/delete-file — delete a single file within public/data/
      server.middlewares.use('/api/delete-file', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { filePath } = JSON.parse(body) as { filePath: string };
            const dataDir = path.resolve(__dirname, 'public/data');
            const fullPath = path.resolve(dataDir, filePath);
            // Safety: ensure we're deleting inside public/data
            if (!fullPath.startsWith(dataDir + path.sep) || fullPath === dataDir) {
              res.statusCode = 400;
              res.end(`Invalid path: ${filePath}`);
              return;
            }
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              // Clean up empty parent directory (only within public/data/)
              const parentDir = path.dirname(fullPath);
              if (parentDir !== dataDir && parentDir.startsWith(dataDir + path.sep)) {
                try {
                  const remaining = fs.readdirSync(parentDir);
                  if (remaining.length === 0) fs.rmdirSync(parentDir);
                } catch { /* ignore */ }
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      // Delete a region folder
      server.middlewares.use('/api/delete-folder', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { folder } = JSON.parse(body) as { folder: string };
            const dataDir = path.resolve(__dirname, 'public/data');
            const folderPath = path.resolve(dataDir, folder);
            // Safety: ensure we're deleting inside public/data
            if (!folderPath.startsWith(dataDir + path.sep) || folderPath === dataDir) {
              res.statusCode = 400;
              res.end(`Invalid folder: ${folder}`);
              return;
            }
            fs.rmSync(folderPath, { recursive: true, force: true });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      // GET /api/list-rasters?region={id} — list raster analysis metadata
      server.middlewares.use('/api/list-rasters', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const regionId = url.searchParams.get('region');
          if (!regionId) {
            res.statusCode = 400;
            res.end('Missing region parameter');
            return;
          }
          const dataDir = path.resolve(__dirname, 'public/data');
          const regionDir = path.resolve(dataDir, regionId);
          if (!regionDir.startsWith(dataDir + path.sep)) {
            res.statusCode = 400;
            res.end('Invalid region');
            return;
          }
          const results: any[] = [];
          if (fs.existsSync(regionDir)) {
            // Scan subdirectories for raster_*.json (new layout)
            for (const sub of fs.readdirSync(regionDir, { withFileTypes: true })) {
              if (!sub.isDirectory()) continue;
              const subDir = path.join(regionDir, sub.name);
              for (const file of fs.readdirSync(subDir)) {
                if (file.startsWith('raster_') && file.endsWith('.json')) {
                  try {
                    const data = JSON.parse(fs.readFileSync(path.join(subDir, file), 'utf-8'));
                    // Parse dataType from filename: raster_{dataType}_{code}.json
                    const match = file.match(/^raster_([a-z0-9_]+?)_(.+)\.json$/);
                    const filePath = `${regionId}/${sub.name}/${file}`;
                    results.push({
                      title: data.title || file,
                      code: data.code || (match ? match[2] : file.replace('.json', '')),
                      aquiferId: data.aquiferId || '',
                      aquiferName: data.aquiferName || '',
                      regionId: data.regionId || regionId,
                      filePath,
                      dataType: data.dataType || (match ? match[1] : 'wte'),
                      params: data.params || {},
                      createdAt: data.createdAt || '',
                      options: data.options || undefined,
                      generatedAt: data.generatedAt || undefined,
                    });
                  } catch { /* skip malformed */ }
                }
              }
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(results));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      // POST /api/rename-raster — rename a raster analysis file
      server.middlewares.use('/api/rename-raster', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { oldPath, newPath, newCode, newTitle } = JSON.parse(body) as {
              oldPath: string; newPath: string; newCode: string; newTitle: string;
            };
            const dataDir = path.resolve(__dirname, 'public/data');
            const fullOldPath = path.resolve(dataDir, oldPath);
            const fullNewPath = path.resolve(dataDir, newPath);

            // Safety: ensure both paths are within public/data
            if (!fullOldPath.startsWith(dataDir + path.sep) || !fullNewPath.startsWith(dataDir + path.sep)) {
              res.statusCode = 400;
              res.end('Invalid path');
              return;
            }

            if (!fs.existsSync(fullOldPath)) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            // Read, update, write
            const data = JSON.parse(fs.readFileSync(fullOldPath, 'utf-8'));
            data.code = newCode;
            data.title = newTitle;

            fs.mkdirSync(path.dirname(fullNewPath), { recursive: true });
            fs.writeFileSync(fullNewPath, JSON.stringify(data), 'utf-8');

            // Delete old file if path changed
            if (fullOldPath !== fullNewPath) {
              fs.unlinkSync(fullOldPath);
              // Clean up empty parent directory
              const parentDir = path.dirname(fullOldPath);
              if (parentDir !== dataDir && parentDir.startsWith(dataDir + path.sep)) {
                try {
                  const remaining = fs.readdirSync(parentDir);
                  if (remaining.length === 0) fs.rmdirSync(parentDir);
                } catch { /* ignore */ }
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      // GET /api/list-models?region={id} — list imputation model metadata
      server.middlewares.use('/api/list-models', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const regionId = url.searchParams.get('region');
          if (!regionId) {
            res.statusCode = 400;
            res.end('Missing region parameter');
            return;
          }
          const dataDir = path.resolve(__dirname, 'public/data');
          const regionDir = path.resolve(dataDir, regionId);
          if (!regionDir.startsWith(dataDir + path.sep)) {
            res.statusCode = 400;
            res.end('Invalid region');
            return;
          }
          const results: any[] = [];
          if (fs.existsSync(regionDir)) {
            for (const sub of fs.readdirSync(regionDir, { withFileTypes: true })) {
              if (!sub.isDirectory()) continue;
              const subDir = path.join(regionDir, sub.name);
              for (const file of fs.readdirSync(subDir)) {
                if (file.startsWith('model_') && file.endsWith('.json')) {
                  try {
                    const data = JSON.parse(fs.readFileSync(path.join(subDir, file), 'utf-8'));
                    const filePath = `${regionId}/${sub.name}/${file}`;
                    // Strip data and log arrays for performance
                    results.push({
                      title: data.title || file,
                      code: data.code || file.replace('.json', ''),
                      aquiferId: data.aquiferId || '',
                      aquiferName: data.aquiferName || '',
                      regionId: data.regionId || regionId,
                      filePath,
                      dataType: data.dataType || 'wte',
                      params: data.params || {},
                      createdAt: data.createdAt || '',
                      wellMetrics: data.wellMetrics || {},
                    });
                  } catch { /* skip malformed */ }
                }
              }
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(results));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      // GET /api/gldas-proxy?url={encodedUrl} — proxy GLDAS THREDDS requests for CORS
      server.middlewares.use('/api/gldas-proxy', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const targetUrl = url.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url parameter');
            return;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(timeout);
            const contentType = response.headers.get('content-type') || 'text/plain';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            const body = await response.text();
            res.end(body);
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            res.statusCode = 502;
            res.end(`GLDAS proxy error: ${fetchErr.message || fetchErr}`);
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      // POST /api/rename-model — rename an imputation model file
      server.middlewares.use('/api/rename-model', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { oldPath, newPath, newCode, newTitle } = JSON.parse(body) as {
              oldPath: string; newPath: string; newCode: string; newTitle: string;
            };
            const dataDir = path.resolve(__dirname, 'public/data');
            const fullOldPath = path.resolve(dataDir, oldPath);
            const fullNewPath = path.resolve(dataDir, newPath);

            if (!fullOldPath.startsWith(dataDir + path.sep) || !fullNewPath.startsWith(dataDir + path.sep)) {
              res.statusCode = 400;
              res.end('Invalid path');
              return;
            }

            if (!fs.existsSync(fullOldPath)) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            const data = JSON.parse(fs.readFileSync(fullOldPath, 'utf-8'));
            data.code = newCode;
            data.title = newTitle;

            fs.mkdirSync(path.dirname(fullNewPath), { recursive: true });
            fs.writeFileSync(fullNewPath, JSON.stringify(data), 'utf-8');

            if (fullOldPath !== fullNewPath) {
              fs.unlinkSync(fullOldPath);
              const parentDir = path.dirname(fullOldPath);
              if (parentDir !== dataDir && parentDir.startsWith(dataDir + path.sep)) {
                try {
                  const remaining = fs.readdirSync(parentDir);
                  if (remaining.length === 0) fs.rmdirSync(parentDir);
                } catch { /* ignore */ }
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      server.middlewares.use('/api/save-data', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { files } = JSON.parse(body) as { files: { path: string; content: string }[] };
            const dataDir = path.resolve(__dirname, 'public/data');
            for (const file of files) {
              const filePath = path.resolve(dataDir, file.path);
              // Safety: ensure we're writing inside public/data
              if (!filePath.startsWith(dataDir)) {
                res.statusCode = 400;
                res.end(`Invalid path: ${file.path}`);
                return;
              }
              fs.mkdirSync(path.dirname(filePath), { recursive: true });
              fs.writeFileSync(filePath, file.content, 'utf-8');
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, count: files.length }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: env.VITE_BASE_PATH || '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), saveDataPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.USGS_API_KEY': JSON.stringify(env.USGS_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['react', 'react-dom'],
      }
    };
});
