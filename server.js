const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://mbjc.info' }));

// SICHERHEIT: Der Webhook-Link bleibt geheim auf dem Server!
const DISCORD_WEBHOOK_URL = process.env.DISCORD_2FA_WEBHOOK;

// Speicher für temporäre 2FA Codes (Im echten Betrieb via Redis)
const activeCodes = new Map();

// Autorisierte Benutzer (später in Datenbank speichern)
let allowedAdmins = ['owner_1', 'owner_2'];

// 1. 2FA Code anfordern
app.post('/api/auth/request-2fa', async (req, res) => {
  const { username } = req.body;

  if (!username || !allowedAdmins.includes(username.toLowerCase())) {
    return res.status(403).json({ error: 'Benutzer nicht berechtigt.' });
  }

  // Generiere sicheren 6-stelligen Code
  const code = crypto.randomInt(100000, 999999).toString();
  
  // Speichere Code mit 5 Minuten Ablaufzeit
  activeCodes.set(username.toLowerCase(), {
    code: code,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  // Discord Webhook Benachrichtigung senden
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [{
        title: "🔐 Admin 2FA Anforderung",
        description: `Der Benutzer **${username}** hat sich im Admin-Panel angemeldet.`,
        color: 0x6366f1,
        fields: [
          { name: "Sicherheitscode", value: `\`\`\`${code}\`\`\``, inline: true },
          { name: "Gültigkeit", value: "5 Minuten", inline: true }
        ],
        timestamp: new Date()
      }]
    });

    res.json({ success: true, message: 'Code an Discord gesendet.' });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Senden des Webhooks.' });
  }
});

app.listen(3000, () => console.log('2FA Auth-Server läuft auf Port 3000'));
