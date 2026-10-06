/**
 * Every tool's name and where its code lives — small enough for the command
 * palette to import without loading any tool.
 */
export interface ToolInfo { id: string; name: string; emoji: string; group: string; words: string; mod: "time" | "write" | "maths" | "study" | "art"; part: string }
export const TOOL_LIST: ToolInfo[] = [
  { id: "timer", name: "Focus timer", emoji: "🍅", group: "Time", words: "pomodoro timer focus break study", mod: "time", part: "Timer" },
  { id: "stopwatch", name: "Stopwatch", emoji: "⏱️", group: "Time", words: "stopwatch lap time", mod: "time", part: "Stopwatch" },
  { id: "clock", name: "Clock", emoji: "🕐", group: "Time", words: "clock date time week", mod: "time", part: "Clock" },
  { id: "worldclock", name: "World clock", emoji: "🌍", group: "Time", words: "world clock time zone city", mod: "time", part: "WorldClock" },
  { id: "countdowns", name: "Countdowns", emoji: "📅", group: "Time", words: "countdown exam holiday birthday days until", mod: "time", part: "Countdowns" },
  { id: "weekend", name: "Weekend countdown", emoji: "🎉", group: "Time", words: "weekend friday", mod: "time", part: "Weekend" },
  { id: "breathing", name: "Breathing", emoji: "🫧", group: "Time", words: "breathe calm relax stress", mod: "time", part: "Breathing" },
  { id: "metronome", name: "Metronome", emoji: "🎵", group: "Time", words: "metronome music bpm tempo beat", mod: "time", part: "Metronome" },
  { id: "notes", name: "Notes", emoji: "📝", group: "Write", words: "notes scratchpad private write", mod: "write", part: "Notes" },
  { id: "todos", name: "To-do list", emoji: "✅", group: "Write", words: "todo tasks list homework", mod: "write", part: "Todos" },
  { id: "wordcount", name: "Word counter", emoji: "🔤", group: "Write", words: "word character count essay", mod: "write", part: "WordCounter" },
  { id: "case", name: "Text case", emoji: "🔠", group: "Write", words: "uppercase lowercase title case convert", mod: "write", part: "CaseConverter" },
  { id: "dictionary", name: "Dictionary", emoji: "📖", group: "Write", words: "dictionary define meaning word", mod: "write", part: "Dictionary" },
  { id: "codes", name: "Binary & Morse", emoji: "📟", group: "Write", words: "binary morse hex code secret caesar", mod: "write", part: "CodeConverter" },
  { id: "password", name: "Password maker", emoji: "🔐", group: "Write", words: "password generator secure", mod: "write", part: "PasswordMaker" },
  { id: "emoji", name: "Emoji search", emoji: "😀", group: "Write", words: "emoji copy search", mod: "write", part: "EmojiSearch" },
  { id: "daily", name: "Word, quote & fact", emoji: "💡", group: "Write", words: "word of the day quote fact", mod: "write", part: "Daily" },
  { id: "calculator", name: "Calculator", emoji: "🧮", group: "Maths", words: "calculator scientific maths sum sin cos", mod: "maths", part: "Calculator" },
  { id: "percent", name: "Percentages", emoji: "💯", group: "Maths", words: "percent percentage score change", mod: "maths", part: "Percentage" },
  { id: "units", name: "Unit converter", emoji: "📏", group: "Maths", words: "unit convert length weight temperature cm inch", mod: "maths", part: "UnitConverter" },
  { id: "random", name: "Dice & picker", emoji: "🎲", group: "Maths", words: "dice coin flip random pick number", mod: "maths", part: "RandomTools" },
  { id: "teams", name: "Team maker", emoji: "👥", group: "Maths", words: "team groups random split", mod: "maths", part: "TeamMaker" },
  { id: "flashcards", name: "Flashcards", emoji: "🗂️", group: "Study", words: "flashcards revise study cards vocab", mod: "study", part: "Flashcards" },
  { id: "habits", name: "Habit tracker", emoji: "🔥", group: "Study", words: "habit streak daily tracker", mod: "study", part: "Habits" },
  { id: "typing", name: "Typing test", emoji: "⌨️", group: "Study", words: "typing speed wpm test leaderboard", mod: "study", part: "TypingTest" },
  { id: "color", name: "Colour picker", emoji: "🎨", group: "Art", words: "color colour picker hex rgb", mod: "art", part: "ColorPicker" },
  { id: "palette", name: "Palette maker", emoji: "🌈", group: "Art", words: "palette colours scheme", mod: "art", part: "PaletteMaker" },
  { id: "sketch", name: "Sketchpad", emoji: "✏️", group: "Art", words: "draw sketch paint doodle", mod: "art", part: "Sketchpad" },
  { id: "pixel", name: "Pixel art", emoji: "👾", group: "Art", words: "pixel art grid draw", mod: "art", part: "PixelArt" },
];
