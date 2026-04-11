import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TEST_MODE = process.env.TEST_MODE === "true";

let allUsers = new Set();
let completedUsers = new Set();

// 🔥 LOAD GROUP WITH RETRY
async function loadGroup(sock) {
  try {
    const meta = await sock.groupMetadata(TARGET_GROUP);

    const myId = sock.user.id;

    allUsers = new Set(
      meta.participants
        .map((p) => p.id)
        .filter((id) => id !== myId)
    );

    console.log("👥 Members loaded:", allUsers.size);
  } catch (err) {
    console.log("🔄 Retry loading group...");
    setTimeout(() => loadGroup(sock), 5000);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    syncFullHistory: true,
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 MESSAGE HANDLER
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;

    if (!msg.key.participant) return;

    const user = msg.key.participant;

    // 🔥 HANDLE ALL TYPES
    const messageContent =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message;

    const text =
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text;

    const isVideo = messageContent?.videoMessage !== undefined;

    console.log("📩 Incoming:", text || "VIDEO");

    if (isVideo || text?.toLowerCase().includes("#done132")) {
      completedUsers.add(user);

      await sock.sendMessage(chatId, {
        text: `✅ @${user.split("@")[0]} completed task`,
        mentions: [user],
      });
    }
  });

  // ⏰ REPORT
  cron.schedule(TEST_MODE ? "*/2 * * * *" : "0 12 * * *", async () => {
    console.log("📊 Generating report...");

    if (allUsers.size === 0) {
      await sock.sendMessage(TARGET_GROUP, {
        text: "⚠️ Users not loaded yet.",
      });
      return;
    }

    const notDone = [...allUsers].filter(
      (user) => !completedUsers.has(user)
    );

    if (notDone.length === 0) {
      await sock.sendMessage(TARGET_GROUP, {
        text: "🎉 Everyone completed today's task! 🔥",
      });
    } else {
      let message = "❌ *Not completed today's task:*\n\n";

      notDone.forEach((user) => {
        message += `@${user.split("@")[0]}\n`;
      });

      message += "\n💰 ₹2 fine applied";

      await sock.sendMessage(TARGET_GROUP, {
        text: message,
        mentions: notDone,
      });
    }

    completedUsers.clear();
  });

  // 🔗 CONNECTION
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan QR below:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot connected!");

      setTimeout(() => loadGroup(sock), 3000);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnecting...");
        startBot();
      }
    }
  });
}

startBot();