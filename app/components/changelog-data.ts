/** Updates to the site itself, newest first (shared by the changelog page and the "what's new" pop-up). */
export const RELEASES: { version: string; date: string; title: string; items: string[] }[] = [
  {
    version: "3.1", date: "2026-10", title: "Build your own design",
    items: [
      "🎨 The design builder (Customize → Design → Build your own): make your own home page, Figma style",
      "Drag in over 100 parts — every piece of every design, clocks, timers, notes, shapes and buttons — then move, resize and colour them",
      "Pieces snap to a grid; hold Ctrl to place them anywhere, with guides when edges line up",
      "Program your own buttons to open a website, a folder, a search, chat and more",
      "Share your design to the gallery (a moderator checks it first) or use someone else's",
    ],
  },
  {
    version: "3.0", date: "2026-10", title: "Safety, help & Español",
    items: [
      "The site in Spanish — pick “Español” in Customize → Text",
      "Help, rules and privacy pages; new members agree to the rules when they sign up",
      "Report a bug or message an admin from the ⋯ menu, and tell us how a page feels (😀 😐 🙁)",
      "A short tour and keyboard tips for first-time visitors",
      "An optional warning before you leave for a website that isn't on the list",
      "New links can be checked against Google's list of dangerous sites",
      "People who aren't logged in no longer see who added or liked things",
      "A heads-up before you're logged out, with a button to stay logged in",
      "This pop-up after each update, and the version number in the footer",
    ],
  },
  {
    version: "2.5", date: "2026-10", title: "Phones & the app",
    items: [
      "A bottom bar on phones: home, search, add, chat and more",
      "Swipe a card right to star it, left to open it; pull down to refresh",
      "Share a link from any app straight into the site, and long-press the app icon for shortcuts",
      "Pop-ups slide up from the bottom on phones; folders sit side by side on tablets; better in landscape",
      "Bigger buttons and vibration options, a status bar that matches your theme, and a splash screen",
      "Step-by-step install instructions for iPhone, Android and computers",
    ],
  },
  {
    version: "2.4", date: "2026-10", title: "Your data",
    items: [
      "Download every folder for Chrome or Edge, a folder as a spreadsheet, or print the list",
      "An “Add from any website” button for your bookmarks bar",
      "The last 7 days at a glance",
      "Put a folder on another website with its embed code; RSS, JSON and calendar feeds",
      "Links you add while offline are sent when you're back online",
      "A warning if someone else changed a link while you were editing it",
      "A peek at each website when you rest the mouse on it",
      "Bring your own settings back from a “Download my data” file",
      "For admins: daily backups, a link checker, a health check, CSV import and merging duplicates",
    ],
  },
  {
    version: "2.3", date: "2026-10", title: "Moderation & admin",
    items: [
      "Report a link or a chat message (🚩) and a moderator will look",
      "Moderators can warn, time out, mute or pause edits — with reasons and history",
      "Folders can be locked, limited to contributors, or shown only to members",
      "Admins can switch on approval for new links, invite-only sign-ups and a read-only maintenance mode",
      "Deleted links and folders go to a trash and can be restored",
      "A dashboard with charts, a staff board, and much more for admins",
    ],
  },
  {
    version: "2.2", date: "2026-10", title: "Look & feel",
    items: [
      "A new Customize window with a live preview: 14 themes (including Retro 95 and Terminal), any accent colour, backgrounds and dark mode by time of day",
      "Fonts (including a dyslexia-friendly one), text size, weight and line spacing",
      "Card styles, hover effects, an icon-only grid, folder header styles, page width and a folder list down the side",
      "Hide or reorder parts of the homepage; minimal mode with no emoji; emoji or line icons",
      "Share your theme as a code or a link, show it on your profile, and try the admins' theme of the month",
      "High contrast, colourblind-safe colours, always-underlined links, skip-to-content and clearer keyboard focus",
      "“What's this?” mode explains any button, and pages can be read aloud",
      "Seasonal touches, holiday logos, snow in December, fireworks at New Year and an optional sparkle when you click",
      "A greeting, an “On this day” link, a site pet that grows with the site — and a few secrets to find 🥚",
    ],
  },
  {
    version: "2.1", date: "2026-10", title: "Tools",
    items: [
      "A tools drawer (press O): focus timer, stopwatch, world clock, countdowns, breathing and a metronome",
      "Private notes, to-do list, habit tracker and flashcards that follow your account",
      "Calculator with a scientific mode, percentages, unit converter, dice, random picker and team maker",
      "Typing speed test with a leaderboard",
      "Word counter, text case, dictionary, binary & Morse, password maker and emoji search",
      "Colour picker, palette maker, sketchpad and pixel art",
      "Word, quote and fact of the day",
      "Pop any tool out into its own window; tools remember where you left off",
      "Private sticky notes on folders",
    ],
  },
  {
    version: "2.0", date: "2026-10", title: "Community",
    items: [
      "A new Community page: link requests, Q&A with best answers, tips, shoutouts and a guestbook",
      "Challenges and link of the month, decided by votes",
      "Ideas & roadmap: vote and comment on ideas, and see what's planned",
      "Events calendar, hall of fame and a monthly recap",
      "A small wiki anyone can edit",
      "“Today” strip: link of the day, would-you-rather, a riddle and the next goal",
      "Say thanks to whoever added a link, and add notes everyone can see (checked by a moderator first)",
      "Polls can allow several answers, be anonymous, close on a date, or be the poll of the week",
      "Suggest new folders or changes to a folder",
      "Flair next to people's names",
    ],
  },
  {
    version: "1.5", date: "2026-09", title: "Chat",
    items: [
      "Channels and clubs, each with their own folder",
      "Edit and delete messages, threads, polls, reactions, pins and saved messages",
      "Formatting: bold, code, spoilers, maths and link previews",
      "Slash commands, slow mode and a pop-out chat window",
    ],
  },
  {
    version: "1.4", date: "2026-09", title: "Notifications",
    items: ["Filters and per-type settings", "Do not disturb", "Phone and desktop push notifications", "A weekly digest"],
  },
  {
    version: "1.3", date: "2026-08", title: "Accounts & profiles",
    items: ["Profile pages and a People page", "Follow people and give kudos", "2-step login and an Account & security screen", "Rename, export or delete your account"],
  },
  {
    version: "1.2", date: "2026-08", title: "Search & folders",
    items: [
      "Search that forgives typos, with suggestions and voice search",
      "Shareable searches and links to a single card",
      "Sub-folders, spaces, smart folders and folder maintainers",
      "Saved views and tag colours",
    ],
  },
];
export const APP_VERSION = RELEASES[0].version;
