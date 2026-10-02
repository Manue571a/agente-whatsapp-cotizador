const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

// Función de Scraping adaptada a Dukal.cl
async function buscarEnDukal(busqueda) {
  try {
    const url = 'https://dukal.cl';
    const { data: html } = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(html);
    const resultados = [];
    const consulta = busqueda.toLowerCase().replace(/"/g, '').trim();

    $('a[href*="/listings/"]').each((_, el) => {
      const link = $(el).attr('href');
      const contenedor = $(el).closest('div, article, li');
      let textoBloque = contenedor.text().replace(/\s+/g, ' ').trim();
      let titulo = $(contenedor).find('h2, h3, h4, .title, a[href*="/listings/"]').first().text().trim();
      
      const precioMatch = textoBloque.match(/\$\d{1,3}(\.\d{3})+/);
      const precio = precioMatch ? precioMatch[0] : 'Consultar';

      if (titulo && (titulo.toLowerCase().includes(consulta) || consulta === 'hola' || consulta === 'cotizar' || consulta === 'autos' || consulta === '')) {
        if (!resultados.some(item => item.link === link)) {
          resultados.push({ titulo, precio, link });
        }
      }
    });

    if (resultados.length > 0) {
      let mensaje = `🚗 *Vehículos encontrados en Dukal.cl:*\n\n`;
      resultados.slice(0, 4).forEach((auto, index) => {
        mensaje += `*${index + 1}. ${auto.titulo}*\n`;
        mensaje += `• *Precio:* ${auto.precio}\n`;
        mensaje += `• *Ver ficha:* ${auto.link}\n\n`;
      });
      mensaje += `¿Te gustaría solicitar un crédito o agendar una prueba de manejo?`;
      return mensaje;
    } else {
      return `¡Hola! Bienvenid@ a *Dukal.cl* 🚗\n\nNo encontré modelos con la palabra "${busqueda}". Puedes ver todo nuestro catálogo disponible aquí: https://dukal.cl/inventory/`;
    }

  } catch (error) {
    console.error('Error haciendo scraping en Dukal.cl:', error.message);
    return `¡Hola! Bienvenid@ a *Dukal.cl* 🚗\n\nPuedes revisar todos nuestros vehículos disponibles directamente en: https://dukal.cl`;
  }
}

// Endpoint Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', port: process.env.PORT || 3000 });
});

// Endpoint Verificación Webhook
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

// Endpoint Eventos Webhook WhatsApp
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

      console.log(`Petición recibida de ${from}: "${textBody}"`);

      // Obtener respuesta
      const respuestaTexto = await buscarEnDukal(textBody);

      // Intentar enviar respuesta por la API de Meta
      const metaResponse = await axios({
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

      console.log(`Respuesta enviada con éxito a ${from}. Message ID:`, metaResponse.data?.messages?.[0]?.id);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('ERROR ENVIANDO MENSAJE A META:', error.response?.data || error.message);
    res.sendStatus(200); // Se responde 200 a Meta para evitar reintentos infinitos
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Dukal listo en puerto ' + PORT));
