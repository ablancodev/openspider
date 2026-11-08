# TODO

Funcionalidades que OpenSpider todavía no tiene y que podrían añadirse en el futuro. No hay ningún orden de prioridad. Lo que ya está implementado aparece en la interfaz; aquí solo va lo que falta.

## Victorias rápidas (los datos ya se extraen, falta usarlos)

- [ ] **Viewport**: filtro e incidencia «Falta meta viewport». El dato ya está en `rec.viewport`.
- [ ] **Open Graph y Twitter Cards**: sección con filtros para og:title, og:description y og:image ausentes o duplicados. Ya están en `rec.og` y `rec.twitter`.
- [ ] **Charset**: incidencia si falta `<meta charset>` o no es UTF-8 (`rec.charset`).
- [ ] **Imágenes lazy**: filtro de imágenes sin `loading="lazy"` por debajo del pliegue. El parser ya guarda `lazy` en el enlace, pero `Crawler.addLink` no lo copia a la arista.
- [ ] **Hreflang y paginación por cabecera HTTP `Link`**: `hreflangHttp`, `relNextHttp` y `relPrevHttp` se leen, pero ni se validan ni se rastrean.
- [ ] **Cadenas de redirección como filtro**: hoy solo existen como informe. Añadir filtros como «Redirect Chain» o «Redirect Loop» a Response Codes.
- [ ] **Estructura de encabezados completa**: `headingSeq` guarda H1–H6. Se podría mostrar el esquema de la página y detectar saltos de H3 a H6.
- [ ] Quitar `crawlSWF` de `DEFAULT_CONFIG`, porque no se usa.

## Rastreo

- [ ] **Renderizado JavaScript** con un navegador headless, para webs SPA. Ahora la «Vista previa» muestra el HTML sin ejecutar JS.
- [ ] **Login por formulario o cookies de sesión gestionadas**. Ahora solo hay Basic/Digest y cabeceras manuales.
- [ ] **Persistencia del rastreo en IndexedDB** para rastreos grandes y para reanudar tras recargar la página.
- [ ] **Rastreos programados** y comparación entre rastreos (URLs nuevas, eliminadas, cambios de título, estado, etc.).
- [ ] **Área de contenido configurable**: qué selectores se excluyen del cálculo de palabras y de duplicados. Ahora son `nav`, `header` y `footer` fijos.
- [ ] **Extracción personalizada con JavaScript**, además de CSS, XPath y Regex.
- [ ] **Perfiles de configuración**: guardar, importar y exportar configuraciones con nombre.

## Análisis SEO

- [ ] **Validación de datos estructurados** contra schema.org y los requisitos de resultados enriquecidos de Google. Ahora solo se detectan errores de sintaxis JSON-LD.
- [ ] **Microdata y RDFa completos**: ahora solo se cuentan los tipos.
- [ ] **Validación AMP**: ahora solo se lee el `<link rel="amphtml">`.
- [ ] **Core Web Vitals** con la API de PageSpeed Insights / CrUX.
- [ ] **Accesibilidad básica**: contraste, etiquetas de formularios, landmarks, idioma.
- [ ] **Ortografía y gramática** del contenido.
- [ ] **Segmentos**: agrupar URLs por patrón o carpeta y ver incidencias por segmento.
- [ ] **Análisis de logs** del servidor (qué rastrea realmente Googlebot).

## Integraciones

- [ ] Google Search Console (clics, impresiones, URLs indexadas).
- [ ] Google Analytics 4 (sesiones por URL, páginas huérfanas con tráfico).
- [ ] Métricas de enlaces externos (Ahrefs, Moz, Majestic…).
- [ ] Exportar a Google Sheets y a XLSX, además de CSV.

## Interfaz

- [ ] **Selector de columnas**: mostrar, ocultar y reordenar columnas, y recordar anchos entre sesiones.
- [ ] **Panel de resumen** (dashboard) con gráficos de estado, profundidad e incidencias por sección.
- [ ] **Interfaz en inglés** (i18n), y repasar qué términos SEO se mantienen en inglés.
- [ ] Atajos de teclado para cambiar de sección y de filtro, y una paleta de comandos (⌘K).
- [ ] **Directivas obsoletas**: valorar si quitar NoODP, NoYDIR y la sección Meta Keywords, que Google ya ignora.
