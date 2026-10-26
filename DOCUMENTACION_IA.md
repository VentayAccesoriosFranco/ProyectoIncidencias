
# Integración de Inteligencia Artificial

## Proyecto
Plataforma de Reportes e Incidencias

## Objetivo
Apoyar al personal administrativo con tres funciones automáticas:

1. **Prioridad** de cada incidencia (Alta, Media o Baja).
2. **Categoría sugerida** a partir del título y la descripción (HU-12, RF-17).
3. **Resumen automático** de la incidencia para revisarla rápidamente (HU-13, RF-18).

## Tecnologías utilizadas
- Python
- Flask
- Ollama
- Modelo llama3.2:1b (ejecutado localmente)
- PostgreSQL
- SQLAlchemy

## Funcionamiento

### 1. Prioridad automática
1. El ciudadano registra una incidencia desde el formulario web.
2. La API revisa primero **reglas de seguridad** (incendio, fuego, llamas, fuga de gas, inundación, cables expuestos, etc.). Si hay peligro para las personas, la prioridad es Alta.
3. Si no aplica ninguna regla, se consulta al modelo de IA, que responde Alta, Media o Baja.
4. Si Ollama no está disponible, se asigna Media como valor predeterminado.

### 2. Categoría sugerida
1. Se buscan **palabras clave** por categoría, incluyendo expresiones comunes en Guatemala (por ejemplo: foco, bombillo o «se fue la luz» → Alumbrado público; tubería → Fuga de agua; bache → Calles dañadas; fuego, humo o quemazón → Incendios).
2. Si no hay coincidencias, se consulta al modelo de IA para elegir una de las categorías.
3. El ciudadano puede dejar que la IA elija la categoría o pulsar «Sugerir con IA» antes de enviar.
4. La sugerencia queda guardada en el campo `categoria_sugerida` y el administrador la ve en el panel de gestión.

### 3. Resumen automático
1. El administrador pulsa «Generar resumen» en la ventana de gestión.
2. La API envía el título, la categoría, la prioridad y la descripción al modelo y le pide un resumen de máximo 2 oraciones con la acción recomendada.
3. El resumen se guarda en `resumen_ia` y se registra en el historial.
4. Si Ollama no está disponible, se genera un **resumen básico** con la información principal del reporte, para que el sistema siga funcionando.

## Endpoints relacionados
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/incidencias` | Asigna prioridad y categoría sugerida al crear |
| POST | `/api/incidencias/sugerir-categoria` | Sugiere categoría sin registrar la incidencia |
| POST | `/api/incidencias/<id>/resumen` | Genera el resumen automático (administrador) |

## Observaciones
- La clasificación automática es una recomendación inicial. El administrador puede cambiar la prioridad y la categoría manualmente, y cada cambio queda en el historial.
- El historial registra con qué método se clasificó cada incidencia (reglas de seguridad, palabras clave, inteligencia artificial o valor predeterminado).
