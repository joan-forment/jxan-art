/* =========================================================
   TU MÚSICA — EDITA SOLO ESTE ARCHIVO
   cover:    ruta a la portada cuadrada (ej. "covers/mi-album.jpg").
             Déjalo "" y se genera un disco con tus colores + el título.
             (Las portadas solo se ven con servidor: Live Server o ya subida a internet.)
   link:     a dónde lleva el disco al hacer clic (Spotify, SoundCloud…).
   platform: nombre que sale en el botón ("Spotify", "SoundCloud"…).
   credits:  filas de arriba a la izquierda. Usa [ ] para varias líneas.
   quotes:   citas de abajo (máx. 2). stars de 0 a 5 (admite 4.5). Pon [] si no quieres.
   El orden de la lista = el orden de los discos.
   ========================================================= */
const ARTIST = "jxan";
const ARTIST_SPOTIFY = "https://open.spotify.com/artist/7sNPR8PUriQikrJMgTy6wD";
// Clave pública de los avisos (no es secreta).
const NOTIFY_KEY = "BJFldNtnQ7FnoqATSNe6IEcsMXr9-4ILadOs_CHjnra6oYHO1AzZVEAUzJaa7I23c-myt9KGuA36M_bpy3tnimM";

const RELEASES = [
  {
    // PRÓXIMO EP — sale primero. Con upcoming: true muestra el botón "Avísame".
    title: "cuacuacuack",
    type: "EP",
    year: 2026,
    upcoming: true,
    cover: "covers/cuacuacuack.jpg",
    colors: ["#e9a13b", "#141414"],
    link: ARTIST_SPOTIFY,
    platform: "Spotify",
    credits: { "Artista": "jxan", "Tipo": "EP", "Lanzamiento": "Muy pronto" },
    quotes: [],
  },
  {
    title: "1/2",
    type: "Single",
    year: 2026,
    cover: "covers/1-2.jpg",
    colors: ["#e6d29a", "#3a2228"],
    link: "https://soundcloud.com/jxannt/1-2",
    platform: "SoundCloud",
    credits: { "Artista": "jxan", "Tipo": "Single", "Año": "2026" },
    quotes: [],
  },
  {
    title: "lo k inventas",
    type: "Single",
    year: 2026,
    cover: "covers/lo-k-inventas.jpg",
    colors: ["#e3b04b", "#2f5f6b"],
    link: "https://soundcloud.com/jxannt/lo-k-inventas-ft-fastorr",
    platform: "SoundCloud",
    credits: { "Artista": "jxan", "Con": "fastorr", "Año": "2026" },
    quotes: [],
  },
  {
    title: "espérate",
    type: "Single",
    year: 2026,
    cover: "covers/esperate.jpg",
    colors: ["#b8902a", "#1c2a3a"],
    link: "https://open.spotify.com/intl-es/album/74y3FrT6iv7BAtV4BJIqcf?si=P0Q209PkQnuwolwYnEMq8g",
    platform: "Spotify",
    credits: { "Artista": "jxan", "Tipo": "Single", "Año": "2026" },
    quotes: [],
  },
  {
    title: "ART",
    type: "Single",
    year: 2026,
    cover: "covers/art.jpg",
    colors: ["#8a93a8", "#1d2333"],
    link: "https://open.spotify.com/intl-es/album/1PDJkZFZjD8UNOHO1p9fgX?si=IcNQt-WSTVKumpAuMXCV7g",
    platform: "Spotify",
    credits: { "Artista": "jxan", "Tipo": "Single", "Año": "2026" },
    quotes: [],
  },
];
