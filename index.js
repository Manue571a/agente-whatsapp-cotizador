const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

// Función de Scraping adaptada a la estructura WordPress de Dukal.cl
async function buscarEnDukal(busqueda) {
  try {
    const url = 'https://dukal.cl';
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    const resultados = [];
    const consulta = busqueda.toLowerCase().trim();

    // Recorrer los enlaces de publicaciones (/listings/)
    $('a[href*="/listings/"]').each((_, el) => {
      const link = $(el).attr('href');
      const contenedor = $(el).closest('div, article, li');
      
      // Extraer datos del bloque contenedor
      let textoBloque = contenedor.text().replace(/\s+/g, ' ').trim();
      let titulo = $(contenedor).find('h2, h3, h4, .title, a[href*="/listings/"]').first().text().trim();
      
      // Buscar el precio principal en el bloque
      const precioMatch = textoBloque.match(/\$\d{1,3}(\.\d{3})+/);
      const precio = precioMatch ? precioMatch[0] : 'Consultar';

      // Si se encuentra título y coincide con la búsqueda
      if (titulo && (titulo.toLowerCase().includes(consulta) || consulta === 'hola' || consulta === 'cotizar' || consulta === 'autos')) {
        // Evitar duplicados por el enlace
        if (!resultados.some(item => item.link === link)) {
          resultados.push({
            titulo: titulo,
            precio: precio,
            link: link
          });
        }
      }
    });

    // Construir mensaje para enviar a WhatsApp
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
      return `No encontré vehículos coincidentes con "${busqueda}" en la portada.\n\nPuedes revisar todo nuestro catálogo en https://dukal.cl/inventory/`;
    }

  } catch (error) {
    console.error('Error realizando scraping:', error.message);
    return `¡Hola! Revisa el catálogo actualizado en nuestro sitio web: https://dukal.cl`;
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

      console.log(`Consulta recibida de ${from}: "${textBody}"`);

      // Obtener vehículos de dukal.cl
      const respuestaTexto = await buscarEnDukal(textBody);

      // Responder vía Graph API
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

      console.log(`Respuesta con datos reales enviada a ${from}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error enviando mensaje:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Dukal Scraper listo en puerto ' + PORT));
