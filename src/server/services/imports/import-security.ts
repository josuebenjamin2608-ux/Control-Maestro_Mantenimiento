/**
 * Límite server-side para archivos .xlsx importados (Solicitudes/Minutas).
 * El atributo `accept=".xlsx"` del `<input type="file">` es solo una
 * sugerencia del navegador — cualquier llamador HTTP directo a esta Server
 * Action puede enviar cualquier tamaño, así que el límite real tiene que
 * aplicarse acá, ANTES de leer el archivo completo a memoria o de invocar
 * ExcelJS. 10 MB es holgado para el vocabulario de columnas de SIMI (10-16
 * columnas de texto/fecha, sin imágenes): un archivo real de varios miles
 * de filas pesa un orden de magnitud menos que esto.
 */
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
