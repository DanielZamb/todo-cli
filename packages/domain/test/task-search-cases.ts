export const searchCases = [
  {
    text: "صلى الله",
    title: "ﷺ",
    matches: [{ field: "title", start: 0, end: 1 }],
  },
  { text: "𐐨abc", title: "𐐀abx", matches: null },
  { text: "😀".repeat(100), title: "Ready", matches: [] },
  {
    text: '"pay rent"',
    title: "Pay, rent today",
    matches: [
      { field: "title", start: 0, end: 3 },
      { field: "title", start: 5, end: 9 },
    ],
  },
  {
    text: "reno",
    title: "Renovar el pasaporte",
    matches: [{ field: "title", start: 0, end: 7 }],
  },
  { text: "ovar", title: "Renovar el pasaporte", matches: null },
  {
    text: "cancion",
    title: "Canción de cuna",
    matches: [{ field: "title", start: 0, end: 7 }],
  },
  {
    text: "canción",
    title: "cancion",
    matches: [{ field: "title", start: 0, end: 7 }],
  },
  {
    text: "pasaprote",
    title: "pasaporte",
    matches: [{ field: "title", start: 0, end: 9 }],
  },
  {
    text: "pay rent",
    title: "Rent: pay by Friday",
    matches: [
      { field: "title", start: 0, end: 4 },
      { field: "title", start: 6, end: 9 },
    ],
  },
  { text: '"pay rent"', title: "Rent: pay by Friday", matches: null },
  {
    text: '"pay rent"',
    title: "Pay rent today",
    matches: [
      { field: "title", start: 0, end: 3 },
      { field: "title", start: 4, end: 8 },
    ],
  },
  {
    text: '"pay re',
    title: "Pay rent today",
    matches: [
      { field: "title", start: 0, end: 3 },
      { field: "title", start: 4, end: 8 },
    ],
  },
  { text: '"pay ren"', title: "Pay rent today", matches: null },
  { text: '"pay ret', title: "Pay rent today", matches: null },
  { text: "rent -draft", title: "Rent draft", matches: null },
  { text: "rent -draft", title: "Rent drafts", matches: null },
  {
    text: "rent -draft",
    title: "Rent drift",
    matches: [{ field: "title", start: 0, end: 4 }],
  },
  {
    text: "follow-up",
    title: "Follow up today",
    matches: [
      { field: "title", start: 0, end: 6 },
      { field: "title", start: 7, end: 9 },
    ],
  },
  { text: "follow-up", title: "Follow today", matches: null },
  { text: "-", title: "Anything", matches: [] },
  { text: "", title: "Anything", matches: [] },
  { text: " \t\n ", title: "Anything", matches: [] },
  { text: "-draft", title: "Ready", matches: [] },
  { text: "-draft", title: "Drafting", matches: null },
  { text: '-"pay rent"', title: "Pay rent today", matches: null },
  { text: '-"pay re', title: "Pay rent today", matches: null },
  {
    text: "rent",
    title: "Other",
    description: "Pay rent today",
    matches: [{ field: "description", start: 4, end: 8 }],
  },
  {
    text: "pay rent",
    title: "Pay",
    description: "Rent",
    matches: [
      { field: "title", start: 0, end: 3 },
      { field: "description", start: 0, end: 4 },
    ],
  },
  { text: '"pay rent"', title: "Pay", description: "Rent", matches: null },
  {
    text: "strasse",
    title: "Straße STRASSE",
    matches: [
      { field: "title", start: 0, end: 6 },
      { field: "title", start: 7, end: 14 },
    ],
  },
  { text: "ffi", title: "ﬃ", matches: [{ field: "title", start: 0, end: 1 }] },
  {
    text: "cafe",
    title: "Cafe\u0301",
    matches: [{ field: "title", start: 0, end: 5 }],
  },
  {
    text: "𐐨",
    title: "😀 𐐀bc",
    matches: [{ field: "title", start: 3, end: 7 }],
  },
  { text: "σσ", title: "ςΣ", matches: [{ field: "title", start: 0, end: 2 }] },
  {
    text: "rent rent ren",
    title: "Rent rental",
    matches: [
      { field: "title", start: 0, end: 4 },
      { field: "title", start: 5, end: 11 },
    ],
  },
  { text: "abxd", title: "abcd", matches: null },
  {
    text: "abxde",
    title: "abcde",
    matches: [{ field: "title", start: 0, end: 5 }],
  },
  { text: "abxyefgh", title: "abcdefgh", matches: null },
  {
    text: "abxyefghi",
    title: "abcdefghi",
    matches: [{ field: "title", start: 0, end: 9 }],
  },
  {
    text: "abcde",
    title: "abxdeTAIL",
    matches: [{ field: "title", start: 0, end: 9 }],
  },
  {
    text: "abcdefghi",
    title: "abcfdeghiTAIL",
    matches: [{ field: "title", start: 0, end: 13 }],
  },
  {
    text: "abcdefghi",
    title: "acbdefgihTAIL",
    matches: [{ field: "title", start: 0, end: 13 }],
  },
  {
    text: "abcadefgh",
    title: "abacdefgh",
    matches: [{ field: "title", start: 0, end: 9 }],
  },
  {
    text: "caxyxxxxx",
    title: "abcxyxxxxx",
    matches: [{ field: "title", start: 0, end: 10 }],
  },
  { text: "z".repeat(200), title: "Ready", matches: null },
] as const;
