require("dotenv").config();
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Discord Bot is Online!");
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// CONFIG
// =====================================================

const PREFIX = ".";

const DB_FILE = path.join(__dirname, "tickets.json");

let db = {
  guilds: {},
  tickets: {},
  panels: {},
  pendingButtons: {},
  vouches: {},
};

// =====================================================
// LOAD DATABASE
// =====================================================

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    db.guilds ||= {};
    db.tickets ||= {};
    db.panels ||= {};
    db.pendingButtons ||= {};
    db.vouches ||= {};
  } catch (error) {
    console.log("❌ Invalid tickets.json. Creating new database.");

    db = {
      guilds: {},
      tickets: {},
      panels: {},
      pendingButtons: {},
      vouches: {},
    };
  }
}

function saveDB() {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

// =====================================================
// HELPERS
// =====================================================

function getGuildSettings(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      transcriptChannel: null,
      vouchChannel: null,
      adminRoles: [],
    };

    saveDB();
  }

  return db.guilds[guildId];
}

function getGuildTickets(guildId) {
  return Object.values(db.tickets).filter(
    ticket => ticket.guildId === guildId
  );
}

function getTicketByChannel(channelId) {
  return db.tickets[channelId] || null;
}

function isServerAdmin(member) {
  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function isTicketAdmin(member, guildId) {
  if (isServerAdmin(member)) {
    return true;
  }

  const settings = getGuildSettings(guildId);

  return settings.adminRoles.some(roleId =>
    member.roles.cache.has(roleId)
  );
}

function cleanAmount(input) {
  if (!input) return null;

  const cleaned = String(input)
    .replace(/[$,\s]/g, "")
    .trim();

  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

function timestamp(date = Date.now()) {
  return Math.floor(date / 1000);
}

function makeTicketId() {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
}

function getServerIcon(guild) {
  return guild.iconURL({
    extension: "png",
    size: 256,
  }) || undefined;
}

function escapeHTML(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================================
// TRANSCRIPT
// =====================================================

async function createTranscript(channel, ticket) {
  const messages = [];

  try {
    let lastId;

    while (true) {
      const options = {
        limit: 100,
      };

      if (lastId) {
        options.before = lastId;
      }

      const batch =
        await channel.messages.fetch(options);

      if (!batch.size) {
        break;
      }

      messages.push(...batch.values());

      lastId = batch.last().id;

      if (batch.size < 100) {
        break;
      }

      if (messages.length >= 1000) {
        break;
      }
    }
  } catch (error) {
    console.log(
      "Transcript fetch error:",
      error.message
    );
  }

  messages.sort(
    (a, b) =>
      a.createdTimestamp - b.createdTimestamp
  );

  const messageHTML = messages
    .map(message => {
      const attachments =
        [...message.attachments.values()]
          .map(
            attachment => `
              <div class="attachment">
                <a href="${escapeHTML(
                  attachment.url
                )}" target="_blank">
                  ${escapeHTML(
                    attachment.name ||
                      "Attachment"
                  )}
                </a>
              </div>
            `
          )
          .join("");

      return `
        <div class="message">

          <img
            class="avatar"
            src="${escapeHTML(
              message.author.displayAvatarURL({
                extension: "png",
                size: 128,
              })
            )}"
          >

          <div class="content">

            <div class="top">
              <strong>
                ${escapeHTML(
                  message.author.tag
                )}
              </strong>

              <span>
                ${new Date(
                  message.createdTimestamp
                ).toLocaleString()}
              </span>
            </div>

            <div class="text">
              ${escapeHTML(
                message.content ||
                  "(No text)"
              )}
            </div>

            ${attachments}

          </div>

        </div>
      `;
    })
    .join("");

  const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>
Ticket Transcript - ${escapeHTML(
    ticket.ticketId
  )}
</title>

<style>

body {
  margin: 0;
  padding: 30px;
  background: #0b0b0f;
  color: #eeeeee;
  font-family: Arial, sans-serif;
}

.header {
  background: #15151c;
  padding: 25px;
  border-radius: 15px;
  margin-bottom: 20px;
}

.header h1 {
  margin: 0 0 10px;
}

.info {
  color: #aaa;
  line-height: 1.7;
}

.message {
  display: flex;
  gap: 12px;
  padding: 15px;
  margin-bottom: 8px;
  background: #121218;
  border-radius: 10px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.content {
  flex: 1;
}

.top {
  display: flex;
  gap: 10px;
  align-items: center;
}

.top span {
  color: #777;
  font-size: 12px;
}

.text {
  margin-top: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

.attachment {
  margin-top: 8px;
}

.attachment a {
  color: #8ab4ff;
}

</style>

</head>

<body>

<div class="header">

<h1>
🎫 Ticket Transcript
</h1>

<div class="info">

<b>Ticket ID:</b>
${escapeHTML(ticket.ticketId)}
<br>

<b>Owner:</b>
${escapeHTML(ticket.ownerTag)}
<br>

<b>Ticket Type:</b>
${escapeHTML(ticket.type)}
<br>

<b>Opened:</b>
${new Date(
  ticket.createdAt
).toLocaleString()}
<br>

<b>Closed:</b>
${new Date().toLocaleString()}

</div>

</div>

${messageHTML}

</body>

</html>
`;

  const fileName =
    `transcript-${ticket.ticketId}.html`;

  const filePath =
    path.join(__dirname, fileName);

  fs.writeFileSync(
    filePath,
    html
  );

  return {
    fileName,
    filePath,
  };
}
// =====================================================
// SEND TRANSCRIPT
// =====================================================

async function sendTranscript(
  guild,
  channel,
  ticket
) {
  const settings =
    getGuildSettings(guild.id);

  if (!settings.transcriptChannel) {
    return false;
  }

  const logChannel =
    guild.channels.cache.get(
      settings.transcriptChannel
    );

  if (!logChannel) {
    return false;
  }

  const transcript =
    await createTranscript(
      channel,
      ticket
    );

  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📄 Ticket Transcript")
      .setDescription(
        `Transcript generated for **${channel.name}**`
      )
      .addFields(
        {
          name: "🎫 Ticket ID",
          value: `\`${ticket.ticketId}\``,
          inline: true,
        },
        {
          name: "👤 Owner",
          value: `<@${ticket.ownerId}>`,
          inline: true,
        },
        {
          name: "📁 Type",
          value: ticket.type,
          inline: true,
        },
        {
          name: "🕐 Opened",
          value:
            `<t:${timestamp(
              ticket.createdAt
            )}:F>`,
          inline: true,
        },
        {
          name: "🔒 Closed",
          value:
            `<t:${timestamp()}:F>`,
          inline: true,
        }
      )
      .setTimestamp();

  const icon =
    getServerIcon(guild);

  if (icon) {
    embed.setThumbnail(icon);
  }

  try {
    await logChannel.send({
      embeds: [embed],

      files: [
        {
          attachment:
            transcript.filePath,
          name:
            transcript.fileName,
        },
      ],
    });

    if (
      fs.existsSync(
        transcript.filePath
      )
    ) {
      fs.unlinkSync(
        transcript.filePath
      );
    }

    return true;

  } catch (error) {

    console.log(
      "Transcript send error:",
      error.message
    );

    try {
      if (
        fs.existsSync(
          transcript.filePath
        )
      ) {
        fs.unlinkSync(
          transcript.filePath
        );
      }
    } catch {}

    return false;
  }
}

// =====================================================
// CLOSE TICKET
// =====================================================

async function closeTicket(
  channel,
  closedBy
) {
  const ticket =
    getTicketByChannel(
      channel.id
    );

  if (!ticket) {
    return false;
  }

  await sendTranscript(
    channel.guild,
    channel,
    ticket
  );
// Cancel any pending vouch for this ticket
if (db.vouches) {
  for (
    const vouch of Object.values(
      db.vouches
    )
  ) {
    if (
      vouch.ticketChannelId ===
        channel.id &&
      vouch.status ===
        "pending"
    ) {
      vouch.status =
        "cancelled";

      vouch.cancelledAt =
        Date.now();
    }
  }
}
  delete db.tickets[
    channel.id
  ];

  saveDB();

  try {
    await channel.delete(
      `Ticket closed by ${closedBy.tag}`
    );
  } catch (error) {
    console.log(
      "Channel delete error:",
      error.message
    );
  }

  return true;
}

// =====================================================
// TICKET EMBED
// =====================================================

function createTicketEmbed(
  guild,
  ticket
) {
  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        `🖇️ ${ticket.type} Ticket`
      )
      .setDescription(
  [
    `Welcome <@${ticket.ownerId}>!`,
    "",
    "A member of the ticket team will assist you shortly.",
    "",
    "**Ticket Information**",
    "",
    `> 👤 **Ticket Owner :** <@${ticket.ownerId}>`,
      
    `> 🌐 **Ticket Type:** ${ticket.type}`,
      
    `> 📄 **Ticket ID:** \`${ticket.ticketId}\``,
      
    `> 🧿 **Opened:** 
<t:${timestamp(ticket.createdAt)}:F> • <t:${timestamp(ticket.createdAt)}:R>`
  ].join("\n")
)
      .setFooter({
        text:
          `${guild.name} • Ticket ${ticket.ticketId}`,
      })
      .setTimestamp();

  const icon =
    getServerIcon(guild);

  if (icon) {
    embed.setThumbnail(icon);
  }

  if (ticket.ownerAvatar) {
    embed.setAuthor({
      name: ticket.ownerTag,
      iconURL:
        ticket.ownerAvatar,
    });
  }

  return embed;
}

function createCloseRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "ticket_close"
        )
        .setLabel(
          "Close Ticket"
        )
        .setEmoji("🔒")
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

// =====================================================
// PANEL EMBED
// =====================================================

function panelEmbed(
  guild,
  panel
) {
  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        panel.title ||
          "🎫 Support Tickets"
      )
      .setDescription(
        panel.description ||
          "Select a ticket type below to open a ticket."
      );

  if (panel.thumbnail) {
    embed.setThumbnail(
      panel.thumbnail
    );
  } else {
    const icon =
      getServerIcon(guild);

    if (icon) {
      embed.setThumbnail(icon);
    }
  }

  if (panel.banner) {
    embed.setImage(
      panel.banner
    );
  }

  embed.setFooter({
    text:
      `${guild.name} • Ticket Support`,
  });

  return embed;
}

// =====================================================
// PANEL BUTTONS
// =====================================================

function panelButtons(panel) {
  const buttons =
    panel.buttons || [];

  const rows = [];

  for (
    let i = 0;
    i < buttons.length;
    i += 5
  ) {

    const rowButtons =
      buttons
        .slice(i, i + 5)
        .map(button => {

          let style =
            ButtonStyle.Primary;

          if (
            button.style ===
            "success"
          ) {
            style =
              ButtonStyle.Success;
          }

          if (
            button.style ===
            "danger"
          ) {
            style =
              ButtonStyle.Danger;
          }

          if (
            button.style ===
            "secondary"
          ) {
            style =
              ButtonStyle.Secondary;
          }

          const b =
            new ButtonBuilder()
              .setCustomId(
                `ticket_open_${button.id}`
              )
              .setLabel(
                button.name
                  .substring(0, 80)
              )
              .setStyle(style);

          if (button.emoji) {
            b.setEmoji(
              button.emoji
            );
          }

          return b;
        });

    rows.push(
      new ActionRowBuilder()
        .addComponents(
          rowButtons
        )
    );
  }

  return rows;
}

// =====================================================
// PANEL BUILDER
// =====================================================

async function showPanelBuilder(
  interaction,
  panel
) {
  const embed =
    panelEmbed(
      interaction.guild,
      panel
    );

  const rows =
    panelButtons(panel);

  const controls =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `panel_add_button_${panel.id}`
          )
          .setLabel(
            panel.buttons.length >= 25
              ? "25 Button Limit"
              : "Add Ticket Button"
          )
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Primary
          )
          .setDisabled(
            panel.buttons.length >= 25
          ),

        new ButtonBuilder()
          .setCustomId(
            `panel_publish_${panel.id}`
          )
          .setLabel(
            "Publish Panel"
          )
          .setEmoji("📢")
          .setStyle(
            ButtonStyle.Success
          )
      );

  rows.push(
    controls
  );

  const content =
    `### 🎫 Ticket Panel Builder\n` +
    `Buttons: **${panel.buttons.length}/25**\n` +
    `Each button can open tickets in a different category.`;

  try {

    if (
      interaction.deferred ||
      interaction.replied
    ) {

      await interaction.editReply({
        content,
        embeds: [embed],
        components: rows,
      });

    } else {

      await interaction.reply({
        content,
        embeds: [embed],
        components: rows,
        ephemeral: true,
      });

    }

  } catch (error) {

    console.log(
      "Panel builder error:",
      error.message
    );
  }
}
// =====================================================
// HELP
// =====================================================

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(
      "🎫 Ticket Bot Commands"
    )
    .setDescription(
      "Professional ticket management system."
    )
    .addFields(
      {
        name: "⚙️ Configuration",
        value:
          "`.tsetting` — Configure ticket settings\n" +
          "`.tpanel` — Create ticket panel",
      },
      {
        name: "🎫 Ticket Commands",
        value:
          "`.delete` — Delete current ticket\n" +
          "`.rename <name>` — Rename current ticket\n" +
          "`.vouch <amount>` — Record prize as sent",
      }
    )
    .setFooter({
      text:
        "Ticket Admin permissions are required.",
    });
}

// =====================================================
// MESSAGE CREATE
// =====================================================

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot)
      return;

    if (!message.guild)
      return;
// =================================================
// VOUCH CHANNEL VERIFICATION ⭐
// =================================================

if (
  message.guild &&
  !message.author.bot &&
  db.vouches
) {

  const settings =
    getGuildSettings(
      message.guild.id
    );

  if (
    settings.vouchChannel &&
    message.channel.id ===
      settings.vouchChannel
  ) {

    const content =
      message.content
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const pendingVouches =
      Object.values(
        db.vouches
      ).filter(
        v =>
          v.guildId ===
            message.guild.id &&
          v.status ===
            "pending" &&
          v.recipientId ===
            message.author.id &&
          v.vouchChannelId ===
            message.channel.id
      );

    for (
      const vouch of pendingVouches
    ) {

      const expectedAmount =
        `$${vouch.amount} usd`;

      const hasLegit =
        content.includes(
          "legit!"
        );

      const hasGot =
        content.includes(
          "got"
        );

      const hasAmount =
        content.includes(
          expectedAmount
        );

      const hasCommandRunner =
        content.includes(
          `<@${vouch.sentById}>`
        ) ||
        content.includes(
          `<@!${vouch.sentById}>`
        );

      if (
        hasLegit &&
        hasGot &&
        hasAmount &&
        hasCommandRunner
      ) {

        // Mark vouch as confirmed
        vouch.status =
          "confirmed";

        vouch.confirmedAt =
          Date.now();

        vouch.vouchMessageId =
          message.id;

        vouch.confirmedById =
          message.author.id;

        saveDB();

        // Confirmation in vouch channel
        await message.react("<a:tick:1456926134695497892> ");

        // Find original ticket
        const ticketChannel =
          message.guild.channels.cache.get(
            vouch.ticketChannelId
          );

        if (ticketChannel) {

          await ticketChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(
                  "✅ VOUCH VERIFIED"
                )
                .setDescription(
                  `The vouch from <@${message.author.id}> has been verified successfully.\n\n` +
                  `Generating transcript and closing this ticket in 10 minutes...`
                )
                .addFields(
                  {
                    name: "<a:money_sign:1450077091239297056>  Amount",
                    value:
                      `$${vouch.amount} USD`,
                    inline: true
                  },
                  {
                    name: "🎫 Ticket ID",
                    value:
                      `\`${vouch.ticketId}\``,
                    inline: true
                  }
                )
            ]
          });

          await new Promise(
  resolve =>
    setTimeout(
      resolve,
      10 * 60 * 1000
    )
);

await closeTicket(
  ticketChannel,
  message.author
);
        }

        return;
      }
    }
  }
}
    if (
      !message.content.startsWith(
        PREFIX
      )
    ) {
      return;
    }

    const args =
      message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);

    const command =
      args.shift()?.toLowerCase();

    // =================================================
    // HELP
    // =================================================

    if (
      command === "thelp"
    ) {

      return message.reply({
        embeds: [
          helpEmbed(),
        ],
      });
    }

    // =================================================
    // TSETTING
    // =================================================

    if (
      command === "tsetting"
    ) {

      if (
        !isServerAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ You need **Administrator** permission."
        );
      }

      const settings =
        getGuildSettings(
          message.guild.id
        );

      const embed =
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(
            "⚙️ Ticket Settings"
          )
          .setDescription(
            "Configure your ticket system using the selectors below."
          )
          .addFields(
            {
              name:
                "📄 Transcript Channel",
              value:
                settings.transcriptChannel
                  ? `<#${settings.transcriptChannel}>`
                  : "`Not configured`",
              inline: true,
            },
            {
              name:
                "💸 Vouch Channel",
              value:
                settings.vouchChannel
                  ? `<#${settings.vouchChannel}>`
                  : "`Not configured`",
              inline: true,
            },
            {
              name:
                "🛡️ Ticket Admin Roles",
              value:
                settings.adminRoles.length
                  ? settings.adminRoles
                      .map(
                        id =>
                          `<@&${id}>`
                      )
                      .join(", ")
                  : "`Not configured`",
            }
          )
          .setFooter({
            text:
              `${message.guild.name} • Ticket Configuration`,
          });

      const row1 =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                "setting_transcript"
              )
              .setLabel(
                "Transcript Channel"
              )
              .setEmoji("📄")
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                "setting_vouch"
              )
              .setLabel(
                "Vouch Channel"
              )
              .setEmoji("💸")
              .setStyle(
                ButtonStyle.Success
              )
          );

      const row2 =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                "setting_roles"
              )
              .setLabel(
                "Ticket Admin Roles"
              )
              .setEmoji("🛡️")
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      return message.reply({
        embeds: [embed],
        components: [
          row1,
          row2,
        ],
      });
    }

    // =================================================
    // TPANEL
    // =================================================

    if (
      command === "tpanel"
    ) {

      if (
        !isServerAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ You need **Administrator** permission."
        );
      }

      const panelId =
        `${message.guild.id}_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 7)}`;

      db.panels[panelId] = {
        id: panelId,
        guildId:
          message.guild.id,
        title:
          "🎫 Support Tickets",
        description:
          "Select a ticket type below to open a ticket.",
        thumbnail: "",
        banner: "",
        buttons: [],
      };

      saveDB();

      const row =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                `panel_setup_${panelId}`
              )
              .setLabel(
                "Create Ticket Panel"
              )
              .setEmoji("🎫")
              .setStyle(
                ButtonStyle.Primary
              )
          );

      return message.reply({
        content:
          "Click below to configure your professional ticket panel.",
        components: [row],
      });
    }

    // =================================================
    // DELETE
    // =================================================

    if (
      command === "delete"
    ) {

      const ticket =
        getTicketByChannel(
          message.channel.id
        );

      if (!ticket) {
        return message.reply(
          "❌ This command can only be used inside a ticket."
        );
      }

      if (
        !isTicketAdmin(
          message.member,
          message.guild.id
        )
      ) {
        return message.reply(
          "❌ You don't have Ticket Admin permission."
        );
      }

      await message.reply(
        "🔒 Generating transcript and deleting ticket..."
      );

      await closeTicket(
        message.channel,
        message.author
      );

      return;
    }

    // =================================================
    // RENAME
    // =================================================

    if (
      command === "rename"
    ) {

      const ticket =
        getTicketByChannel(
          message.channel.id
        );

      if (!ticket) {
        return message.reply(
          "❌ This command can only be used inside a ticket."
        );
      }

      if (
        !isTicketAdmin(
          message.member,
          message.guild.id
        )
      ) {
        return message.reply(
          "❌ You don't have Ticket Admin permission."
        );
      }

      const newName =
        args
          .join("-")
          .toLowerCase()
          .replace(
            /[^a-z0-9-_]/g,
            "-"
          )
          .replace(
            /-+/g,
            "-"
          )
          .substring(
            0,
            90
          );

      if (!newName) {
        return message.reply(
          "❌ Usage: `.rename new-name`"
        );
      }

      try {

        await message.channel.setName(
          newName
        );

        return message.reply(
          `✅ Ticket renamed to **${newName}**`
        );

      } catch (error) {

        console.log(error);

        return message.reply(
          "❌ I couldn't rename this ticket."
        );
      }
    }
      // =================================================
// VOUCH ⭐
// =================================================

if (command === "vouch") {

  const ticket = getTicketByChannel(message.channel.id);

  if (!ticket) {
    return message.reply(
      "❌ `.vouch` can only be used inside a ticket."
    );
  }

  if (
    !isTicketAdmin(
      message.member,
      message.guild.id
    )
  ) {
    return message.reply(
      "❌ You don't have Ticket Admin permission."
    );
  }

  const amount = cleanAmount(args[0]);

  if (!amount) {
    return message.reply(
      "❌ Please provide a valid amount.\nExample: `.vouch 50`"
    );
  }

  const settings = getGuildSettings(
    message.guild.id
  );

  if (!settings.vouchChannel) {
    return message.reply(
      "❌ Vouch channel isn't configured.\nUse `.tsetting` first."
    );
  }

  const vouchChannel =
    message.guild.channels.cache.get(
      settings.vouchChannel
    );

  if (!vouchChannel) {
    return message.reply(
      "❌ The configured vouch channel no longer exists."
    );
  }

  // Prevent duplicate pending vouch
  const existingVouch =
    Object.values(db.vouches).find(
      v =>
        v.guildId === message.guild.id &&
        v.ticketChannelId === message.channel.id &&
        v.status === "pending"
    );

  if (existingVouch) {
    return message.reply(
      "⚠️ A vouch is already pending for this ticket."
    );
  }

  const formattedAmount =
    formatAmount(amount);

  const vouchId =
    `${ticket.ticketId}_${Date.now()}`;

  // ONLY this text will be shown when Copy Vouch Format is clicked
  const copyFormat =
    `Legit! Got $${formattedAmount} USD from ${message.author}`;

  db.vouches[vouchId] = {
    vouchId,

    guildId:
      message.guild.id,

    ticketChannelId:
      message.channel.id,

    ticketId:
      ticket.ticketId,

    recipientId:
      ticket.ownerId,

    amount:
      formattedAmount,

    sentById:
      message.author.id,

    sentByTag:
      message.author.tag,

    vouchChannelId:
      settings.vouchChannel,

    createdAt:
      Date.now(),

    status:
      "pending",

    copyFormat
  };

  saveDB();
await message.channel.setName("paid");
  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("💸 PRIZE SENT")
      .setDescription(
        `Your prize has been marked as sent.\n\n` +
        `Please post your vouch in ${vouchChannel} ` +
        `using the button below.\n\n` +
        `⚠️ This ticket will remain open until your vouch is verified.`
      )
      .addFields(
        {
          name: "👤 Recipient",
          value:
            `<@${ticket.ownerId}>`,
          inline: true
        },
        {
          name: "💰 Amount",
          value:
            `**$${formattedAmount} USD**`,
          inline: true
        },
        {
          name: "👮 Sent By",
          value:
            `${message.author}`,
          inline: true
        },
        {
          name: "🎫 Ticket ID",
          value:
            `\`${ticket.ticketId}\``,
          inline: true
        },
        {
          name: "📁 Ticket Type",
          value:
            ticket.type,
          inline: true
        },
        {
          name: "🕐 Completed",
          value:
            `<t:${timestamp()}:F>\n<t:${timestamp()}:R>`,
          inline: true
        }
      )
      .setFooter({
        text:
          `${message.guild.name} • Vouch Required`
      })
      .setTimestamp();

  const serverIcon =
    getServerIcon(message.guild);

  if (ticket.ownerAvatar) {
    embed.setThumbnail(
      ticket.ownerAvatar
    );
  } else if (serverIcon) {
    embed.setThumbnail(
      serverIcon
    );
  }

  if (serverIcon) {
    embed.setAuthor({
      name:
        message.guild.name,
      iconURL:
        serverIcon
    });
  }

  const buttonRow =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `copy_vouch_${vouchId}`
          )
          .setLabel(
            "Copy Vouch Format"
          )
          .setEmoji("📋")
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  // IMPORTANT:
  // Send PRIZE SENT embed inside the SAME ticket
  await message.channel.send({
      content: `<@${ticket.ownerId}>`,
  embeds: [
    embed
  ],
  components: [
    buttonRow
  ]
});

  await message.delete().catch(() => {});

  return;
}
        }
);
// =====================================================
// INTERACTIONS
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      if (!interaction.guild)
        return;

      // =================================================
      // BUTTONS
      // =================================================

      if (
        interaction.isButton()
      ) {

        // ===============================================
        // ===============================================
// COPY VOUCH FORMAT ⭐
// ===============================================

if (
  interaction.customId.startsWith(
    "copy_vouch_"
  )
) {

  const vouchId =
    interaction.customId.replace(
      "copy_vouch_",
      ""
    );

  const vouch =
    db.vouches[vouchId];

  if (!vouch) {
    return interaction.reply({
      content:
        "❌ This vouch record could not be found.",
      ephemeral: true
    });
  }

  if (
    vouch.status !== "pending"
  ) {
    return interaction.reply({
      content:
        "❌ This vouch has already been completed.",
      ephemeral: true
    });
  }

  // ONLY the vouch format.
  // No extra text.
  return interaction.reply({
    content:
      vouch.copyFormat,
    ephemeral: true
  });
}

        // ===============================================
        // SETTINGS BUTTONS
        // ===============================================

        if (
          [
            "setting_transcript",
            "setting_vouch",
            "setting_roles",
          ].includes(
            interaction.customId
          )
        ) {

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {

            return interaction.reply({
              content:
                "❌ You need Administrator permission.",
              ephemeral: true,
            });
          }
        }

        // Transcript selector

        if (
          interaction.customId ===
          "setting_transcript"
        ) {

          const menu =
            new ChannelSelectMenuBuilder()
              .setCustomId(
                "select_transcript_channel"
              )
              .setPlaceholder(
                "Select transcript channel"
              )
              .setChannelTypes(
                ChannelType.GuildText
              );

          return interaction.reply({
            content:
              "📄 Select the transcript/log channel:",
            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                ),
            ],
            ephemeral: true,
          });
        }

        // Vouch selector

        if (
          interaction.customId ===
          "setting_vouch"
        ) {

          const menu =
            new ChannelSelectMenuBuilder()
              .setCustomId(
                "select_vouch_channel"
              )
              .setPlaceholder(
                "Select vouch channel"
              )
              .setChannelTypes(
                ChannelType.GuildText
              );

          return interaction.reply({
            content:
              "💸 Select the vouch channel:",
            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                ),
            ],
            ephemeral: true,
          });
        }

        // Role selector

        if (
          interaction.customId ===
          "setting_roles"
        ) {

          const menu =
            new RoleSelectMenuBuilder()
              .setCustomId(
                "select_ticket_roles"
              )
              .setPlaceholder(
                "Select ticket admin roles"
              )
              .setMinValues(1)
              .setMaxValues(10);

          return interaction.reply({
            content:
              "🛡️ Select Ticket Admin roles:",
            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                ),
            ],
            ephemeral: true,
          });
        }
// ===============================================
        // PANEL SETUP
        // ===============================================

        if (
          interaction.customId.startsWith(
            "panel_setup_"
          )
        ) {

          const panelId =
            interaction.customId.replace(
              "panel_setup_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel session expired.",
              ephemeral: true,
            });
          }

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Administrator permission required.",
              ephemeral: true,
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                `panel_modal_${panelId}`
              )
              .setTitle(
                "Create Ticket Panel"
              );

          const title =
            new TextInputBuilder()
              .setCustomId(
                "panel_title"
              )
              .setLabel(
                "Panel Title"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(256)
              .setValue(
                panel.title
              );

          const description =
            new TextInputBuilder()
              .setCustomId(
                "panel_description"
              )
              .setLabel(
                "Panel Description"
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(true)
              .setMaxLength(4000)
              .setValue(
                panel.description
              );

          const thumbnail =
            new TextInputBuilder()
              .setCustomId(
                "panel_thumbnail"
              )
              .setLabel(
                "Thumbnail URL (optional)"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(false)
              .setValue(
                panel.thumbnail ||
                  ""
              );

          const banner =
            new TextInputBuilder()
              .setCustomId(
                "panel_banner"
              )
              .setLabel(
                "Banner/Image URL (optional)"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(false)
              .setValue(
                panel.banner ||
                  ""
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                title
              ),

            new ActionRowBuilder()
              .addComponents(
                description
              ),

            new ActionRowBuilder()
              .addComponents(
                thumbnail
              ),

            new ActionRowBuilder()
              .addComponents(
                banner
              )
          );

          return interaction.showModal(
            modal
          );
        }

        // ===============================================
        // ADD BUTTON
        // ===============================================

        if (
          interaction.customId.startsWith(
            "panel_add_button_"
          )
        ) {

          const panelId =
            interaction.customId.replace(
              "panel_add_button_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel not found.",
              ephemeral: true,
            });
          }

          if (
            panel.buttons.length >= 25
          ) {
            return interaction.reply({
              content:
                "❌ Discord allows a maximum of 25 buttons per panel.",
              ephemeral: true,
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                `button_modal_${panelId}`
              )
              .setTitle(
                "Add Ticket Button"
              );

          const name =
            new TextInputBuilder()
              .setCustomId(
                "button_name"
              )
              .setLabel(
                "Button Name"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(80)
              .setPlaceholder(
                "Support"
              );

          const emoji =
            new TextInputBuilder()
              .setCustomId(
                "button_emoji"
              )
              .setLabel(
                "Emoji (optional)"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(false)
              .setMaxLength(10)
              .setPlaceholder(
                "🎫"
              );

          const style =
            new TextInputBuilder()
              .setCustomId(
                "button_style"
              )
              .setLabel(
                "primary / success / danger / secondary"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setValue(
                "primary"
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                name
              ),

            new ActionRowBuilder()
              .addComponents(
                emoji
              ),

            new ActionRowBuilder()
              .addComponents(
                style
              )
          );

          return interaction.showModal(
            modal
          );
        }

        // ===============================================
        // PUBLISH PANEL
        // ===============================================

        if (
          interaction.customId.startsWith(
            "panel_publish_"
          )
        ) {

          const panelId =
            interaction.customId.replace(
              "panel_publish_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel not found.",
              ephemeral: true,
            });
          }

          if (
            !panel.buttons.length
          ) {
            return interaction.reply({
              content:
                "❌ Add at least one ticket button first.",
              ephemeral: true,
            });
          }

          const embed =
            panelEmbed(
              interaction.guild,
              panel
            );

          const rows =
            panelButtons(
              panel
            );

          try {

            await interaction.channel.send({
              embeds: [
                embed,
              ],
              components:
                rows,
            });

            return interaction.reply({
              content:
                "✅ Ticket panel published successfully.",
              ephemeral: true,
            });

          } catch (error) {

            console.log(error);

            return interaction.reply({
              content:
                "❌ I couldn't publish the panel. Check my permissions.",
              ephemeral: true,
            });
          }
        }

        // ===============================================
        // CLOSE TICKET
        // ===============================================

        if (
          interaction.customId ===
          "ticket_close"
        ) {

          const ticket =
            getTicketByChannel(
              interaction.channel.id
            );

          if (!ticket) {
            return interaction.reply({
              content:
                "❌ This is not a ticket.",
              ephemeral: true,
            });
          }

             const isAdmin =
            isTicketAdmin(
              interaction.member,
              interaction.guild.id
            );
                     const isOwner =
            interaction.user.id ===
            ticket.ownerId;

          const isAdmin =
            isTicketAdmin(
              interaction.member,
              interaction.guild.id
            );

          if (
            !isOwner &&
            !isAdmin
          ) {
            return interaction.reply({
              content:
                "❌ Only the ticket owner or Ticket Admin can close this ticket.",
              ephemeral: true,
            });
          }

          await interaction.reply({
            content:
              "🔒 Closing ticket and generating transcript...",
          });

          await closeTicket(
            interaction.channel,
            interaction.user
          );

          return;
        }

        // ===============================================
        // OPEN TICKET
        // ===============================================

        if (
          interaction.customId.startsWith(
            "ticket_open_"
          )
        ) {

          const buttonId =
            interaction.customId.replace(
              "ticket_open_",
              ""
            );

          let selectedButton =
            null;

          for (
            const panel of
            Object.values(
              db.panels
            )
          ) {

            const found =
              panel.buttons.find(
                button =>
                  button.id ===
                  buttonId
              );

            if (found) {
              selectedButton =
                found;
              break;
            }
          }

          if (!selectedButton) {
            return interaction.reply({
              content:
                "❌ This ticket button is no longer valid.",
              ephemeral: true,
            });
          }

          const existing =
            getGuildTickets(
              interaction.guild.id
            ).find(
              ticket =>
                ticket.ownerId ===
                  interaction.user.id &&
                ticket.status ===
                  "open"
            );

          if (existing) {
            return interaction.reply({
              content:
                `❌ You already have an open ticket: <#${existing.channelId}>`,
              ephemeral: true,
            });
          }

          const category =
            interaction.guild.channels.cache.get(
              selectedButton.categoryId
            );

          if (
            !category ||
            category.type !==
              ChannelType.GuildCategory
          ) {
            return interaction.reply({
              content:
                "❌ The configured ticket category no longer exists.",
              ephemeral: true,
            });
          }

          await interaction.deferReply({
            ephemeral: true,
          });

          const settings =
            getGuildSettings(
              interaction.guild.id
            );

          const ticketId =
            makeTicketId();

          const permissionOverwrites = [
            {
              id:
                interaction.guild
                  .roles
                  .everyone.id,

              deny: [
                PermissionsBitField.Flags
                  .ViewChannel,
              ],
            },

            {
              id:
                interaction.user.id,

              allow: [
                PermissionsBitField.Flags
                  .ViewChannel,

                PermissionsBitField.Flags
                  .SendMessages,

                PermissionsBitField.Flags
                  .ReadMessageHistory,

                PermissionsBitField.Flags
                  .AttachFiles,

                PermissionsBitField.Flags
                  .EmbedLinks,
              ],
            },

            {
              id:
                interaction.client
                  .user.id,

              allow: [
                PermissionsBitField.Flags
                  .ViewChannel,

                PermissionsBitField.Flags
                  .SendMessages,

                PermissionsBitField.Flags
                  .ReadMessageHistory,

                PermissionsBitField.Flags
                  .ManageChannels,

                PermissionsBitField.Flags
                  .AttachFiles,

                PermissionsBitField.Flags
                  .EmbedLinks,
              ],
            },
          ];

          for (
            const roleId of
            settings.adminRoles
          ) {

            permissionOverwrites.push({
              id: roleId,

              allow: [
                PermissionsBitField.Flags
                  .ViewChannel,

                PermissionsBitField.Flags
                  .SendMessages,

                PermissionsBitField.Flags
                  .ReadMessageHistory,

                PermissionsBitField.Flags
                  .AttachFiles,

                PermissionsBitField.Flags
                  .EmbedLinks,
              ],
            });
          }

          let channel;

          try {

            channel =
              await interaction.guild
                .channels
                .create({

                  name:
                    `${selectedButton.name
                      .toLowerCase()
                      .replace(
                        /[^a-z0-9]/g,
                        "-"
                      )
                      .replace(
                        /-+/g,
                        "-"
                      )
                      .substring(
                        0,
                        45
                      )}-${ticketId.toLowerCase()}`,

                  type:
                    ChannelType.GuildText,

                  parent:
                    category.id,

                  permissionOverwrites,

                  topic:
                    `Ticket ID: ${ticketId} | Owner: ${interaction.user.tag}`,
                });

          } catch (error) {

            console.log(
              "Ticket creation error:",
              error
            );

            return interaction.editReply({
              content:
                "❌ I couldn't create the ticket. Make sure the bot has **Manage Channels** permission.",
            });
          }

          const ticket = {
            channelId:
              channel.id,

            guildId:
              interaction.guild.id,

            ownerId:
              interaction.user.id,

            ownerTag:
              interaction.user.tag,

            ownerAvatar:
              interaction.user.displayAvatarURL({
                extension:
                  "png",

                size:
                  256,
              }),

            type:
              selectedButton.name,

            ticketId,

            createdAt:
              Date.now(),

            status:
              "open",

            panelButtonId:
              buttonId,
          };

          db.tickets[
            channel.id
          ] = ticket;

          saveDB();

          const embed =
            createTicketEmbed(
              interaction.guild,
              ticket
            );

          try {

            await channel.send({
              content:
                `<@${interaction.user.id}>` +
                (
                  settings.adminRoles.length
                    ? " " +
                      settings.adminRoles
                        .map(
                          id =>
                            `<@&${id}>`
                        )
                        .join(" ")
                    : ""
                ),

              embeds: [
                embed,
              ],

              components: [
                createCloseRow(),
              ],
            });

          } catch (error) {

            console.log(
              "Ticket message error:",
              error.message
            );
          }

          return interaction.editReply({
            content:
              `✅ Ticket created: ${channel}`,
          });
        }
      }
        // =================================================
      // MODALS
      // =================================================

      if (
        interaction.isModalSubmit()
      ) {

        // ===============================================
        // PANEL MODAL
        // ===============================================

        if (
          interaction.customId.startsWith(
            "panel_modal_"
          )
        ) {

          const panelId =
            interaction.customId.replace(
              "panel_modal_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel not found.",
              ephemeral: true,
            });
          }

          panel.title =
            interaction.fields.getTextInputValue(
              "panel_title"
            );

          panel.description =
            interaction.fields.getTextInputValue(
              "panel_description"
            );

          panel.thumbnail =
            interaction.fields.getTextInputValue(
              "panel_thumbnail"
            ) || "";

          panel.banner =
            interaction.fields.getTextInputValue(
              "panel_banner"
            ) || "";

          saveDB();

          return showPanelBuilder(
            interaction,
            panel
          );
        }

        // ===============================================
        // BUTTON MODAL
        // ===============================================

        if (
          interaction.customId.startsWith(
            "button_modal_"
          )
        ) {

          const panelId =
            interaction.customId.replace(
              "button_modal_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel not found.",
              ephemeral: true,
            });
          }

          const name =
            interaction.fields.getTextInputValue(
              "button_name"
            );

          const emoji =
            interaction.fields.getTextInputValue(
              "button_emoji"
            ) || "";

          let style =
            interaction.fields
              .getTextInputValue(
                "button_style"
              )
              .toLowerCase()
              .trim();

          const allowedStyles = [
            "primary",
            "success",
            "danger",
            "secondary",
          ];

          if (
            !allowedStyles.includes(
              style
            )
          ) {
            style =
              "primary";
          }

          const buttonId =
            `${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 7)}`;

          const pendingKey =
            `${interaction.guild.id}_${interaction.user.id}`;

          db.pendingButtons[
            pendingKey
          ] = {
            panelId,
            buttonId,
            name,
            emoji,
            style,
          };

          saveDB();

          const categoryMenu =
            new ChannelSelectMenuBuilder()
              .setCustomId(
                `select_category_${panelId}`
              )
              .setPlaceholder(
                "Select ticket category"
              )
              .setChannelTypes(
                ChannelType.GuildCategory
              );

          return interaction.reply({
            content:
              `🎫 Button **${name}** created.\n\nNow select the category where this ticket type should open.`,
            components: [
              new ActionRowBuilder()
                .addComponents(
                  categoryMenu
                ),
            ],
            ephemeral: true,
          });
        }
      }

      // =================================================
      // CHANNEL SELECT
      // =================================================

      if (
        interaction.isChannelSelectMenu()
      ) {

        // ===============================================
        // TRANSCRIPT
        // ===============================================

        if (
          interaction.customId ===
          "select_transcript_channel"
        ) {

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Administrator permission required.",
              ephemeral: true,
            });
          }

          const channelId =
            interaction.values[0];

          const settings =
            getGuildSettings(
              interaction.guild.id
            );

          settings.transcriptChannel =
            channelId;

          saveDB();

          return interaction.update({
            content:
              `✅ Transcript channel set to <#${channelId}>`,
            components: [],
          });
        }

        // ===============================================
        // VOUCH
        // ===============================================

        if (
          interaction.customId ===
          "select_vouch_channel"
        ) {

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Administrator permission required.",
              ephemeral: true,
            });
          }

          const channelId =
            interaction.values[0];

          const settings =
            getGuildSettings(
              interaction.guild.id
            );

          settings.vouchChannel =
            channelId;

          saveDB();

          return interaction.update({
            content:
              `✅ Vouch channel set to <#${channelId}>`,
            components: [],
          });
        }

        // ===============================================
        // CATEGORY
        // ===============================================

        if (
          interaction.customId.startsWith(
            "select_category_"
          )
        ) {

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Administrator permission required.",
              ephemeral: true,
            });
          }

          const panelId =
            interaction.customId.replace(
              "select_category_",
              ""
            );

          const panel =
            db.panels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Panel not found.",
              ephemeral: true,
            });
          }

          const pendingKey =
            `${interaction.guild.id}_${interaction.user.id}`;

          const pending =
            db.pendingButtons[
              pendingKey
            ];

          if (
            !pending ||
            pending.panelId !==
              panelId
          ) {
            return interaction.reply({
              content:
                "❌ Button session expired. Click Add Ticket Button again.",
              ephemeral: true,
            });
          }

          const categoryId =
            interaction.values[0];

          const category =
            interaction.guild.channels.cache.get(
              categoryId
            );

          if (
            !category ||
            category.type !==
              ChannelType.GuildCategory
          ) {
            return interaction.reply({
              content:
                "❌ Invalid category.",
              ephemeral: true,
            });
          }

          panel.buttons.push({
            id:
              pending.buttonId,

            name:
              pending.name,

            emoji:
              pending.emoji,

            style:
              pending.style,

            categoryId,
          });

          delete db.pendingButtons[
            pendingKey
          ];

          saveDB();

          await interaction.deferUpdate();

          return showPanelBuilder(
            interaction,
            panel
          );
        }
      }

      // =================================================
      // ROLE SELECT
      // =================================================

      if (
        interaction.isRoleSelectMenu()
      ) {

        if (
          interaction.customId ===
          "select_ticket_roles"
        ) {

          if (
            !isServerAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Administrator permission required.",
              ephemeral: true,
            });
          }

          const settings =
            getGuildSettings(
              interaction.guild.id
            );

          settings.adminRoles =
            [
              ...interaction.values,
            ];

          saveDB();

          return interaction.update({
            content:
              `✅ Ticket Admin roles updated:\n${interaction.values
                .map(
                  id =>
                    `<@&${id}>`
                )
                .join(", ")}`,
            components: [],
          });
        }
      }

    } catch (error) {

      console.error(
        "Interaction error:",
        error
      );

      try {

        if (
          interaction.deferred ||
          interaction.replied
        ) {

          await interaction.followUp({
            content:
              "❌ Something went wrong while processing this action.",
            ephemeral: true,
          });

        } else {

          await interaction.reply({
            content:
              "❌ Something went wrong while processing this action.",
            ephemeral: true,
          });
        }

      } catch {}
    }
  }
);

// =====================================================
// READY
// =====================================================

client.once(
  "ready",
  () => {

    console.log(
      "================================="
    );

    console.log(
      `Logged in as ${client.user.tag}`
    );

    console.log(
      `Servers: ${client.guilds.cache.size}`
    );

    console.log(
      "Ticket Bot is ONLINE."
    );

    console.log(
      "================================="
    );
  }
);

// =====================================================
// ERROR HANDLING
// =====================================================

client.on(
  "error",
  error => {
    console.error(
      "Discord client error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled promise rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );
  }
);

// =====================================================
// LOGIN
// =====================================================

if (!process.env.TOKEN) {

  console.error(
    "❌ TOKEN is missing from .env"
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
);
