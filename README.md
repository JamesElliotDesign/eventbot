# Hacksaw Event Bot

A ready-to-test Discord event promotion bot for the Hacksaw DayZ server.

The bot uses a Discord forum channel as the event template library. Admins run `/event setup`, choose a predefined forum post, pick a date/time, choose whether it repeats weekly, preview the event, and confirm it. The bot then promotes the next scheduled event automatically.

No RSVP features are included.

## What v1 includes

- `/event setup` wizard
- Pulls event title, body sections, and image from Discord forum posts
- Supports this post format:

```md
## Description
...

## Rules
...

## Rewards
...
```

- Admin role permission checks
- Event preview and confirm button
- Auto-promotion schedule
- Manual promote-now command
- Weekly repeat option
- Stop repeat option
- `/event list` dashboard
- Admin log channel support
- Template refresh/check commands

## Promotion schedule

All times are UTC/GMT.

Monday-Friday: one random daily promo at one of:

- 18:00 GMT
- 21:00 GMT
- 00:00 GMT

Saturday-Sunday: three promos per day at:

- 12:00 GMT
- 15:00 GMT
- 18:00 GMT

The weekday random promo time is chosen once per UTC day and stored, so bot restarts do not change that day's chosen promo time.

## Requirements

Install these on your PC:

1. **Visual Studio Code**
2. **Node.js 20 LTS or newer**
3. **Git** is optional but useful

Recommended VS Code extensions:

- ESLint
- DotENV
- Prettier - Code formatter

## Discord bot setup

In the Discord Developer Portal:

1. Create an application.
2. Create a bot user.
3. Copy the bot token.
4. Copy the application/client ID.
5. Invite the bot to your server with these scopes:
   - `bot`
   - `applications.commands`
6. Recommended bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Slash Commands

The bot must be able to read the forum channel and send messages in the general/promo channel and admin log channel.

## Install and run

Unzip this folder, open it in VS Code, then open the VS Code terminal.

Install dependencies:

```bash
npm install
```

Create your real `.env` file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Fill in `.env`.

Register the slash commands:

```bash
npm run register
```

Start the bot:

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

## `.env` values

```env
DISCORD_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
CLIENT_ID=PASTE_YOUR_APPLICATION_CLIENT_ID_HERE
GUILD_ID=1217816664268083220

TEMPLATE_FORUM_CHANNEL_ID=1500582183767769278
PROMO_CHANNEL_ID=1217816664708747314
ADMIN_LOG_CHANNEL_ID=PASTE_YOUR_ADMIN_LOG_CHANNEL_ID_HERE

ADMIN_ROLE_IDS=
DEFAULT_TIMEZONE=UTC
DATA_FILE=./data/hacksaw-events.json
```

### Admin roles

`ADMIN_ROLE_IDS` is optional.

Add one or more role IDs separated by commas:

```env
ADMIN_ROLE_IDS=123456789012345678,234567890123456789
```

Discord server administrators are always allowed to use the bot admin commands.

## First test flow

1. Make sure the bot can see the forum channel and general channel.
2. Start the bot.
3. Run:

```txt
/event templates-refresh
```

4. Run:

```txt
/event templates-check
```

5. Run:

```txt
/event setup
```

6. Pick an event template.
7. Pick date/time.
8. Choose one-time or repeat weekly.
9. Confirm the preview.
10. Test a manual promotion:

```txt
/event promo-now
```

## Commands

```txt
/event setup
/event list
/event promo-now
/event promo-pause
/event promo-resume
/event promo-status
/event repeat-stop
/event cancel
/event templates-refresh
/event templates-check
```

## Data storage

This test version uses a local JSON file at:

```txt
./data/hacksaw-events.json
```

That keeps setup simple for local testing. For production, the next step should be moving storage to PostgreSQL or another real database.

## Notes and limitations

- The event template dropdown shows up to 25 valid templates because Discord select menus have a 25-option limit.
- Template posts must include `## Description`, `## Rules`, and `## Rewards` headings.
- Each template should have an image attachment on the forum post starter message.
- The bot currently promotes the next upcoming scheduled event.
- RSVP options are intentionally not included.
