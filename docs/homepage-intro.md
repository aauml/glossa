# Homepage intro (portada)

> **Estado: implementado.** La copia vive en `src/components/Cover.astro`, en el objeto
> `COPY`, con una entrada por idioma. Hay dos portadas: `/` (EN) y `/es/` (ES).
> Este documento queda como el texto de referencia; editarlo no cambia el sitio.

Texto de la portada. Bilingüe, sin em dashes.

## EN

Glossa is my editor. I give it links, pasted text, YouTube videos, podcasts, outlets, authors and subjects to follow — and the papers, books and source documents in my library; it reads them, checks what they claim against other outlets, other countries and the record, and writes back one reading: no ads, no side taken.

Want a Glossa of your own? [Get in touch](https://ademas.ai/#:~:text=Terms-,About,-ademas.ai).

## ES

Glossa es mi editor. Le doy enlaces, textos pegados, vídeos de YouTube, pódcast, medios, autores y asuntos que seguir, y los papers, libros y documentos de mi biblioteca; los lee, contrasta lo que afirman con otros medios, otros países y el registro, y me devuelve una sola lectura: sin anuncios y sin tomar partido.

¿Quieres tu propia Glossa? [Escríbeme](https://ademas.ai/#:~:text=Terms-,About,-ademas.ai).

## Por qué la portada es una sola frase

Describe lo que Arturo HACE con Glossa —qué le entrega y qué recibe—, no el tono
ni la misión. Lo que se quitó de aquí y por qué:

- **La línea de eslogan** («Personal annotated readings. I direct, AI executes»):
  decía el tono antes de decir la cosa.
- **El párrafo de la queja** sobre los demás medios: abría por lo ajeno.
- **La promesa de abrirlo algún día**: hablaba de lo que no existe todavía. Ahora
  es una línea discreta: quien quiera la suya, escribe.
- **El credo y la hebra de la tesis**: la hebra académica se dice en la misma
  frase («los papers, libros y documentos de mi biblioteca»); el credo se
  retiró — la frase ya dice quién entrega y quién ejecuta.

Glossa NO tiene página «about» propia: la de ademas.ai ya existe y repetirla
serían dos textos que se contradicen con el tiempo. El enlace apunta allí.

El contacto va por fragmento de texto porque esa sección se dibuja con
JavaScript y no tiene ruta propia (Chrome y Edge saltan a ella; Safari y Firefox
abren el inicio). Si algún día gana URL propia, se cambia en
`src/components/Cover.astro`.
