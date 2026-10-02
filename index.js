const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

// Función para hacer Web Scraping a Dukal.cl en tiempo real
async function buscarEnDukal(busqueda) {
  try {
    const url = 'https://dukal.cl';
    // Obtener el HTML de la página principal / catálogo de Dukal
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(html);
    const resultados = [];
    const consulta = busqueda.toLowerCase().trim();

    // Recorrer los elementos de vehículos en la página
    // (Ajusta los selectores de acuerdo con la estructura HTML de dukal.cl)
    $('article, .vehicle-card, .car-item, div[class*="product"], div[class*="auto"]').each((_, el) => {
      const titulo = $(el).find('h2, h3, .title, [class*="title"]').text().trim();
      const precio = $(el).find('.price, [class*="price"]').text().trim();
      const linkRelativo = $(el).find('a').attr('href');
      const link = linkRelativo ? (linkRelativo.startsWith('http') ? linkRelativo : `${url}${linkRelativo}`) : url;

      if (titulo && titulo.toLowerCase().includes(consulta)) {
        resultados.push({ titulo, precio, link });
      }
    });

    // Construir respuesta de WhatsApp
    if (resultados.length > 0) {
      let mensaje = `🚗 *Vehículos encontrados en Dukal.cl para "${busqueda}":*\n\n`;
      resultados.slice(0, 3).forEach((auto, index) => {
        mensaje += `*${index + 1}. ${auto.titulo}*\n`;
        if (auto.precio) mensaje += `• *Precio:* ${auto.precio}\n`;
        mensaje += `• *Ver en sitio:* ${auto.link}\n\n`;
      });
      mensaje += `¿Deseas agendar una visita o consultar por financiamiento?`;
      return mensaje;
    } else {
      return `No encontré coincidencias exactas para "${busqueda}" en Dukal.cl en este momento.\n\nPuedes revisar el catálogo completo directamente en https://dukal.cl`;
    }

  } catch (error) {
    console.error('Error haciendo scraping en Dukal.cl:', error.message);
    return `¡Hola! Puedes revisar la lista actualizada de vehículos y sus precios directamente en nuestro sitio web: https://dukal.cl`;
  }
}

// Endpoint de Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', port: process.env.PORT || 3000 });
});

// Endpoint de verificación del Webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFICADO');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Endpoint para recibir y responder cotizaciones vía Webhook
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message && message.type === 'text') {
      const from = message.from;
      const textBody = message.text.body;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Obtener respuesta leyendo la web de Dukal.cl
      const respuestaTexto = await buscarEnDukal(textBody);

      // Enviar respuesta por WhatsApp
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: {
          messaging_product: 'whatsapp',
          to: from,
          text: { body: respuestaTexto }
        }
      });

      console.log(`Cotización leída de Dukal.cl y enviada a ${from}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error procesando webhook:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Dukal con Scraper activo en el puerto ' + PORT));
