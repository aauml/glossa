# Homepage intro (portada)

> **Estado: implementado.** La copia vive en `src/components/Cover.astro`, en el objeto
> `COPY`, con una entrada por idioma. Hay dos portadas: `/` (EN) y `/es/` (ES).
> Este documento queda como el texto de referencia; editarlo no cambia el sitio.

Texto de la portada. Bilingüe, sin em dashes.

## EN

Glossa is my editor. I point it at links, videos, podcasts, outlets and authors, and each Sunday it writes back one reading of the week: what happened, checked against other outlets and other countries, no ads, no side taken.

Paste a single article or talk, or just name a subject, and it writes a piece on that instead: it goes out for the counterpoint and for what the record says, then writes from that and from my library of papers, academic texts and primary documents, which it keeps and searches by meaning.

Want a Glossa of your own? [Get in touch](https://ademas.ai/#:~:text=Terms-,About,-ademas.ai).

## ES

Glossa es mi editor. Le señalo enlaces, vídeos, pódcast, medios y autores, y cada domingo me devuelve una sola lectura de la semana: qué pasó, contrastado con otros medios y otros países, sin anuncios y sin tomar partido.

Pego un artículo o una charla, o solo nombro un asunto, y escribe una pieza sobre eso: sale a buscar el contrapunto y lo que dice el registro, y redacta con eso y con mi biblioteca de papers, textos académicos y documentos de origen, que él mismo mantiene y consulta por significado.

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
