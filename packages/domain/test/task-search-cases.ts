export const searchCases = [
  {
    text: "z".repeat(200),
    title: "z".repeat(200) + "tail",
    matches: [{ field: "title", start: 0, end: 204 }],
  },
  {
    text: "z".repeat(200),
    title: "z".repeat(198),
    matches: [{ field: "title", start: 0, end: 198 }],
  },
  { text: "z".repeat(200), title: "z".repeat(197), matches: null },
  {
    text: "𐐨".repeat(5),
    title: "𐐀".repeat(4),
    matches: [{ field: "title", start: 0, end: 8 }],
  },
  { text: "𐐨".repeat(5), title: "𐐀".repeat(3), matches: null },
  {
    text: "\ufdfa".repeat(200),
    title: "Expansion probe",
    description: "\ufdfa".repeat(1000),
    matches: [{ field: "description", start: 0, end: 1000 }],
  },
  {
    text: "alpha ALPHA -beta -BETA",
    title: "Alpha alphabet",
    matches: [
      { field: "title", start: 0, end: 5 },
      { field: "title", start: 6, end: 14 },
    ],
  },
  {
    text: "abxde abxde -abxde -ABXDE",
    title: "abcde",
    matches: [{ field: "title", start: 0, end: 5 }],
  },
  { text: "pay pay -pay -PAY", title: "Pay rent", matches: null },
  {
    text: '"pay pay" "PAY PAY"',
    title: "Pay pay pay",
    matches: [
      { field: "title", start: 0, end: 3 },
      { field: "title", start: 4, end: 7 },
      { field: "title", start: 8, end: 11 },
    ],
  },
  { text: '"pay pay" "PAY PAY"', title: "Pay rent", matches: null },
  { text: '"pay re" "pay re', title: "Pay rent", matches: null },
  { text: '-"pay re" -"PAY RE"', title: "Pay rent", matches: [] },
  { text: '-"pay re" -"pay re', title: "Pay rent", matches: null },
  {
    text: "ﬃ FFI Straße STRASSE",
    title: "ﬃ Straße",
    matches: [
      { field: "title", start: 0, end: 1 },
      { field: "title", start: 2, end: 8 },
    ],
  },
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
