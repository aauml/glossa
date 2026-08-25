# Homepage intro (portada)

> **Estado: implementado.** La copia vive en `src/components/Cover.astro`, en el objeto
> `COPY`, con una entrada por idioma. Hay dos portadas: `/` (EN) y `/es/` (ES).
> Este documento queda como el texto de referencia; editarlo no cambia el sitio.

Texto de la portada. Bilingüe, sin em dashes.

## EN

Glossa is my editor. I give it the sites, videos, podcasts and writers I follow. Every Sunday it reads them and writes back what happened that week, checked against other outlets. No ads, no side taken.

I can also paste in one article, or just name a topic. Then it looks up what other sources say, searches my own library of papers and documents, and writes a single piece on it.

Want a Glossa of your own? <hola@ademas.ai>.

## ES

Glossa es mi editor. Le doy los sitios, vídeos, pódcast y autores que sigo. Cada domingo los lee y me escribe qué pasó esa semana, contrastado con otros medios. Sin anuncios y sin tomar partido.

También puedo pegarle un artículo, o solo decirle un tema. Entonces busca qué dicen otras fuentes, consulta mi biblioteca de papers y documentos, y escribe una sola pieza sobre eso.

¿Quieres tu propia Glossa? <hola@ademas.ai>.

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

El contacto es la dirección `hola@ademas.ai`, escrita entera en la portada.
Se intentó antes enlazar la sección «About» de ademas.ai y no se puede: allí es
estado de React que abre el enlace del pie, y del URL solo se leen parámetros
UTM, así que no hay ruta, hash ni fragmento que la abra desde fuera.
