// server.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors'); 
const scrapeCoches = require('./cochesnet/scraper-coches');
const scrapeMilanuncios = require('./milanuncios/scraper'); // Importar Milanuncios scraper

const app = express();
const port = process.env.PORT || 1337;

// Configuración de CORS
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal - Servir el archivo HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para la búsqueda directa de coches.net (envía consulta a n8n)
app.post('/cochesnet/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'No se proporcionó consulta de búsqueda' });
    }

    console.log('Consulta recibida (Coches.net):', query);

    // Enviar consulta al flujo de n8n para obtener la URL
    const n8nBuscarUrl = 'https://n8n.sitemaster.lat/webhook/search/cochesnet/generate-url';
    const n8nResponse = await axios.post(n8nBuscarUrl, { query }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!n8nResponse.data || !n8nResponse.data.url) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo generar una URL válida para la búsqueda'
      });
    }

    // Obtener la URL generada por n8n
    const searchUrl = n8nResponse.data.url;
    console.log('URL generada:', searchUrl);

    // Realizar scraping con la URL generada
    const scrapedData = await scrapeCoches(searchUrl);

    // Enviar datos al flujo de n8n para guardar en Google Sheets
    const n8nGuardarUrl = 'https://n8n.sitemaster.lat/webhook/cochesguardar';
    await axios.post(n8nGuardarUrl, { body: scrapedData }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Devolver resultados al cliente
    res.json({ success: true, data: scrapedData });
  } catch (error) {
    console.error('Error en la búsqueda de Coches.net:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar la búsqueda'
    });
  }
});

// Ruta alternativa para pruebas de coches.net que usa directamente una URL sin n8n
app.get('/cochesnet/scrape-direct', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ success: false, error: 'No se proporcionó URL' });
    }

    console.log('URL recibida para scraping directo (Coches.net):', url);

    // Ejecutar scraping con la URL proporcionada
    const data = await scrapeCoches(url);

    // Responder al cliente
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error en scraping directo de Coches.net:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NUEVOS ENDPOINTS PARA MILANUNCIOS

// Endpoint para la búsqueda directa de Milanuncios
app.post('/milanuncios/search', async (req, res) => {
  try {
    const { s, type = 'fast', ...otherParams } = req.body;

    // Verificar que se proporcionó un término de búsqueda (s)
    if (!s) {
      return res.status(400).json({ success: false, error: 'No se proporcionó término de búsqueda' });
    }

    console.log('Término de búsqueda recibido (Milanuncios):', s);
    console.log('Parámetros adicionales:', otherParams);

    // Construir objeto de parámetros para el scraper usando la estructura original
    const searchParams = { 
      s,  // Parámetro de búsqueda principal como 's'
      ...otherParams 
    };
    
    // Si no se incluye orden, usar 'relevance' como predeterminado
    if (!searchParams.orden) {
      searchParams.orden = 'relevance';
    }

    console.log('Parámetros completos para el scraper:', searchParams);
    
    // Realizar scraping con los parámetros proporcionados
    const scrapedData = await scrapeMilanuncios(searchParams);

    // Enviar datos al flujo de n8n para guardar en Google Sheets
    const n8nGuardarUrl = 'https://n8n.sitemaster.lat/webhook/save/milanuncios';
    try {
      await axios.post(n8nGuardarUrl, { body: scrapedData }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log("Datos enviados correctamente a n8n para guardar en Google Sheets");
    } catch (n8nError) {
      console.error('Advertencia: No se pudieron guardar los datos en n8n:', n8nError.message);
      // Continuar a pesar del error de n8n
    }

    // Devolver resultados al cliente
    res.json({ success: true, data: scrapedData });
  } catch (error) {
    console.error('Error en la búsqueda de Milanuncios:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar la búsqueda'
    });
  }
});

// Ruta para pruebas de Milanuncios que usa directamente una URL
app.get('/milanuncios/scrape-direct', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ success: false, error: 'No se proporcionó URL' });
    }

    console.log('URL recibida para scraping directo (Milanuncios):', url);

    // Convertir la URL completa en parámetros para el scraper
    const urlObj = new URL(url);
    const searchParams = {};
    
    // Extraer parámetros de la URL
    urlObj.searchParams.forEach((value, key) => {
      searchParams[key] = value;
    });

    // Ejecutar scraping
    const data = await scrapeMilanuncios(searchParams);

    // Responder al cliente
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error en scraping directo de Milanuncios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ruta de información del sistema (útil para debugging y monitoreo)
app.get('/api/system-info', (req, res) => {
  const systemInfo = {
    server: {
      version: '1.1.0',
      port: port,
      time: new Date().toISOString()
    },
    scrapers: {
      cochesnet: {
        available: true,
        version: '1.0'
      },
      milanuncios: {
        available: true,
        version: '1.0'
      }
    }
  };
  res.json(systemInfo);
});

// Servir archivos estáticos si no se encuentran rutas específicas
app.use((req, res, next) => {
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  next();
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
  console.log(`Accede a: http://localhost:${port}`);
  console.log('Scrapers disponibles:');
  console.log('- Coches.net: /cochesnet/search (POST) o /cochesnet/scrape-direct (GET)');
  console.log('- Milanuncios: /milanuncios/search (POST) o /milanuncios/scrape-direct (GET)');
});