const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// CONFIGURACIÓN DE TU CUENTA META
const TOKEN_PERMANENTE = 'EAARcdnxlZCXkBSrm6r4RjesgE3rayQLRF5re3aG4IcTftSGuts7vauOMnkybfmulXnlsIZCnQf0yH41ZAFcoXR6SEvSqDwiGazyHjOukflxkZCn0UNZBWZCWzbx3ZBtSVN9IptXNWvhWRS3kD31QSlp7kZCYnYIxli34vedTfb46LkrzPUaYrYnv095FXBzZBJAZDZD
'; // Pegar aquí tu token de Meta
const PHONE_NUMBER_ID = '1332205446647554';          // ID de producción
const VERIFY_TOKEN = 'dukal_token_secreto_123';      // Token para validar el Webhook

// Memoria temporal para la conversación de los clientes
const estadoClientes = {};

// Función para enviar mensajes vía WhatsApp Cloud API
async function enviarMensajeWhatsApp(telefonoCliente, textoMensaje) {
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefonoCliente,
        type: 'text',
        text: { body: textoMensaje }
      },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN_PERMANENTE}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error al enviar mensaje a Meta:', error.response ? error.response.data : error.message);
  }
}

// 1. VALIDACIÓN DEL WEBHOOK EN META
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('Webhook verificado con éxito en Meta');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. RECEPCIÓN Y FLUJO DE CONVERSACIÓN
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0]?.changes?.[0]?.value;
    const mensaje = entry?.messages?.[0];

    if (mensaje && mensaje.type === 'text') {
      const clienteNum = mensaje.from;
      const textoRecibido = mensaje.text.body;

      if (!estadoClientes[clienteNum]) {
        estadoClientes[clienteNum] = { paso: 'INICIO' };
      }

      const pasoActual = estadoClientes[clienteNum].paso;

      switch (pasoActual) {
        case 'INICIO':
          await enviarMensajeWhatsApp(
            clienteNum,
            "¡Hola! Gracias por escribir a *Dukal Autos*. 😊\n\nVi que te interesó un vehículo en nuestra web dukal.cl.\n\nPara ver si podemos evaluar una opción a tu medida, ¿buscas comprarlo con crédito o al contado?"
          );
          estadoClientes[clienteNum].paso = 'ESPERANDO_RENTA';
          break;

        case 'ESPERANDO_RENTA':
          estadoClientes[clienteNum].tipoPago = textoRecibido;
          await enviarMensajeWhatsApp(
            clienteNum,
            "Excelente. Para calcular las cuotas que mejor se adapten a tu presupuesto, ¿cuál es tu renta líquida mensual aproximada?"
          );
          estadoClientes[clienteNum].paso = 'ESPERANDO_TRABAJO';
          break;

        case 'ESPERANDO_TRABAJO':
          estadoClientes[clienteNum].renta = textoRecibido;
          await enviarMensajeWhatsApp(
            clienteNum,
            "Perfecto. ¿En qué trabajas actualmente? (Por ejemplo: dependiente con contrato, independiente/boletas, o pyme/empresa)."
          );
          estadoClientes[clienteNum].paso = 'ESPERANDO_DICOM';
          break;

        case 'ESPERANDO_DICOM':
          estadoClientes[clienteNum].trabajo = textoRecibido;
          await enviarMensajeWhatsApp(
            clienteNum,
            "Entendido. Un dato muy importante para la evaluación comercial: ¿tienes antecedentes o deudas en DICOM actualmente?"
          );
          estadoClientes[clienteNum].paso = 'FINALIZADO';
          break;

        case 'FINALIZADO':
          estadoClientes[clienteNum].dicom = textoRecibido;
          await enviarMensajeWhatsApp(
            clienteNum,
            "¡Muchas gracias por la información! Con estos datos procesaremos tu preevaluación.\n\nLe derivaré tu ficha a uno de nuestros ejecutivos de ventas de *Dukal Autos* para que te contacte a la brevedad. 🚗"
          );

          console.log("\n==========================================");
          console.log("NUEVA FICHA COMERCIAL REGISTRADA:");
          console.log("Teléfono:", clienteNum);
          console.log("Preferencia de Pago:", estadoClientes[clienteNum].tipoPago);
          console.log("Renta:", estadoClientes[clienteNum].renta);
          console.log("Trabajo:", estadoClientes[clienteNum].trabajo);
          console.log("DICOM:", estadoClientes[clienteNum].dicom);
          console.log("==========================================\n");
          break;
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Dukal Autos escuchando en el puerto ${PORT}`);
});
