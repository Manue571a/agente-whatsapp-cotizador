const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Catalogo de vehículos Dukal.cl
const inventarioDukal = [
  {
    keywords: ['suzuki', 'swift', 'maruti'],
    modelo: 'Suzuki Swift 1.2 GL',
    precio: '$8.990.000',
    ano: '2022',
    link: 'https://dukal.cl'
  },
  {
    keywords: ['chevrolet', 'sail', 'spark'],
    modelo: 'Chevrolet Sail 1.5 LT',
    precio: '$7.490.000',
    ano: '2021',
    link: 'https://dukal.cl'
  },
  {
    keywords: ['toyota', 'yaris', 'corolla'],
    modelo: 'Toyota Yaris 1.5 E',
    precio: '$9.800.000',
    ano: '2023',
    link: 'https://dukal.cl'
  },
  {
    keywords: ['nissan', 'versa', 'kicks'],
    modelo: 'Nissan Versa 1.6 Sense',
    precio: '$8.200.000',
    ano: '2020',
    link: 'https://dukal.cl'
  }
];

// Función para procesar el texto y buscar en el inventario
function buscarCotizacion(texto) {
  const consulta = texto.toLowerCase();

  // Buscar coincidencia en el inventario
  const vehiculoEncontrado = inventarioDukal.find(auto =>
    auto.keywords.some(palabra => consulta.includes(palabra))
  );

  if (vehiculoEncontrado) {
    return `🚗 *Cotización Dukal.cl*\n\n` +
           `• *Modelo:* ${vehiculoEncontrado.modelo}\n` +
           `• *Año:* ${vehiculoEncontrado.ano}\n` +
           `• *Precio:* ${vehiculoEncontrado.precio}\n\n` +
           `Puedes revisar más detalles en nuestro catálogo: ${vehiculoEncontrado.link}\n\n` +
           `¿Te gustaría agendar una prueba de manejo o consultar por financiamiento?`;
  }

  // Respuesta por defecto si no detecta un modelo específico
  return `¡Hola! Bienvenid@ a *Dukal.cl* 🚗\n\n` +
         `Escribe la marca o modelo del vehículo que deseas cotizar (ejemplo: *Suzuki*, *Toyota*, *Chevrolet*, *Nissan*).\n\n` +
         `También puedes ver todo nuestro inventario en https://dukal.cl`;
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

// Endpoint para recibir y responder cotizaciones por WhatsApp
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

      // Generar la respuesta según la búsqueda de la cotización
      const respuestaTexto = buscarCotizacion(textBody);

      // Enviar la respuesta vía Graph API de Meta
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

      console.log(`Cotización enviada con éxito a ${from}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error procesando cotización:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Cotizador Dukal activo en el puerto ' + PORT));
