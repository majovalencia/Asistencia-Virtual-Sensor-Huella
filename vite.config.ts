import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const DB_FILE = path.resolve(__dirname, 'database.json');

function localDbPlugin(): Plugin {
  return {
    name: 'local-db-persistence',
    configureServer(server) {
      server.middlewares.use('/api/db', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(DB_FILE)) {
              const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(fileContent);
              return;
            }
          } catch (err) {
            console.error('Error al leer database.json desde el servidor:', err);
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ students: null, attendanceRecords: null, sqlLogs: null }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: 'Base de datos guardada en el disco local' }));
            } catch (err) {
              console.error('Error al escribir en database.json:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), localDbPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/database.json']
      },
    },
  };
});
