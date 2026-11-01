# Prueba de modelos para glosas semanales por canal

Evaluación local del 1 de noviembre de 2026 con digests de videos publicados
entre el 25 y el 31 de octubre. Ningún texto se publicó en el sitio. Se usó
el mismo material por canal, un prompt común y referencias cortas `v1…vN` que
se restauran a los identificadores originales antes de guardar. El segundo
ensayo corrigió instrucciones que inducían errores de atribución y se evaluó
con lectura comparativa ciega por GPT-6.1 Terra `high`. Los puntajes orientan
la decisión; no equivalen a verificar cada afirmación contra el video original.

| Canal | Videos | Modelo | Costo estimado de la llamada (USD) | Cobertura | Resultado |
| --- | ---: | --- | ---: | --- | --- |
| CSIS | 5 | Luna `high` | 0,0014 | 5/5 | Válido; mejor juicio editorial del grupo |
| CSIS | 5 | Haiku 5.5 `high` | 0,0070 | 5/5 | Válido |
| CSIS | 5 | Sonnet 5.5 `high` | 0,0433 | 5/5 | Válido tras corregir un falso positivo del validador de comillas |
| CSIS | 5 | DeepSeek V4 Pro sin razonamiento | 0,0043 | 5/5 | Válido en forma; peor atribución |
| CSIS | 5 | Meta Muse Spark 1.3 `high` | 0,0183 | 5/5 | Válido |
| Glenn Diesen | 9 | Luna `high` | 0,0018 | 9/9 | Válido; mejor juicio editorial del grupo |
| Glenn Diesen | 9 | Haiku 5.5 `high` | 0,0081 | 9/9 | Válido |
| Glenn Diesen | 9 | Sonnet 5.5 `high` | 0,0462 | 9/9 | Válido |
| Glenn Diesen | 9 | DeepSeek V4 Pro sin razonamiento | 0,0052 | 9/9 | Válido en forma; peor atribución |
| Glenn Diesen | 9 | Meta Muse Spark 1.3 `high` | 0,0381 | 9/9 | Válido |
| La Saga | 44 | Luna `high` | 0,0056 | 44/44 | Válido; 7 secciones, 2152 palabras |
| La Saga | 44 | Sonnet 5.5 `high` | 0,1935 | 44/44 | Rechazado: 13 secciones, máximo 12 |

La primera ronda incluyó además Grok 4.20 con razonamiento y DeepSeek V4 Pro
con razonamiento. Ninguno superó a Luna en los dos canales pequeños. Moonshot
K3 no se probó en vivo porque el saldo disponible era cero.

Luna también tuvo errores editoriales: en CSIS atribuyó una cifra a una persona
que el digest no identificaba como hablante; en Diesen concretó el mecanismo
de una política monetaria más allá de lo que decía el digest. Por eso las
referencias exhaustivas y las compuertas de estructura son necesarias, y una
lectura posterior de las primeras publicaciones sigue siendo aconsejable.

Los costos son cálculos con el uso de tokens que devolvieron las API y sus
tarifas públicas, no cargos confirmados de factura. Incluyen tokens internos
de razonamiento cuando el proveedor los cobra. No incluyen el costo previo de
crear los digests, ni el costo del juez usado en esta evaluación. El costo de
producción puede cambiar con el volumen y la tarifa vigente.

**Recomendación:** Luna `high` como escritor inicial para los canales elegidos.
Conservar el tope de USD 0,75 por canal y semana, registrar el costo real de
cada llamada y empezar con uno o dos canales para inspeccionar las primeras
publicaciones automáticas.
