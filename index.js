const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

// Función para buscar en Dukal.cl
async function buscarEnDukal(busqueda) {
  try {
    const url = 'https://dukal.cl';
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
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

      if (titulo && (titulo.toLowerCase().includes(consulta) || consulta === 'hola' || consulta === 'cotizar' || consulta === '')) {
        if (!resultados.some(item => item.link === link)) {
          resultados.push({ titulo, precio, link });
        }
      }
    });

    if (resultados.length > 0) {
      let mensaje = `🚗 Vehículos encontrados en Dukal.cl:\n\n`;
      resultados.slice(0, 3).forEach((auto, index) => {
        mensaje += `${index + 1}. ${auto.titulo}\n`;
        mensaje += `• Precio: ${auto.precio}\n`;
        mensaje += `• Ver ficha: ${auto.link}\n\n`;
      });
      mensaje += `¿Te gustaría agendar una prueba de manejo o solicitar financiamiento?`;
      return mensaje;
    } else {
      return `¡Hola! No encontré coincidencias para "${busqueda}". Puedes ver todo el catálogo en https://dukal.cl/inventory/`;
    }

  } catch (error) {
    console.error('Error en scraping:', error.message);
    return `¡Hola! Revisa todo el catálogo actualizado en nuestro sitio web: https://dukal.cl`;
  }
}

// Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Verificación Webhook Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Eventos Webhook
app.post('/webhook', async (req, res) => {
  // Confirmación inmediata a Meta
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message && message.type === 'text') {
      const from = message.from;
      const textBody = message.text.body;
      const phoneNumberId = value.metadata?.phone_number_id || '1351513428040133';

      console.log(`[ENTRANTE] Mensaje de ${from}: "${textBody}"`);

      const respuestaTexto = await buscarEnDukal(textBody);

      // Envío de respuesta mediante API Graph v25.0
      const response = await axios.post(
        `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: from,
          type: 'text',
          text: { preview_url: false, body: respuestaTexto }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`[ÉXITO] Mensaje enviado a ${from}. ID: ${response.data?.messages?.[0]?.id}`);
    }
  } catch (error) {
    console.error('[ERROR META API]:', error.response?.data || error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Dukal listo en puerto ' + PORT));
