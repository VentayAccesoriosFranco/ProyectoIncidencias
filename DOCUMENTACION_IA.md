
# Integración de Inteligencia Artificial

## Proyecto
Plataforma de Reportes e Incidencias

## Objetivo
Clasificar automáticamente la prioridad de las incidencias registradas por los usuarios.

## Tecnologías utilizadas
- Python
- Flask
- Ollama
- Modelo llama3.2:1b
- PostgreSQL
- SQLAlchemy

## Funcionamiento
1. El usuario inicia sesión mediante Keycloak.
2. Registra una incidencia desde el formulario web.
3. La API recibe el título y la descripción.
4. El clasificador analiza la información mediante reglas de seguridad e inteligencia artificial.
5. El sistema determina una prioridad: Alta, Media o Baja.
6. La incidencia se almacena en PostgreSQL.
7. El frontend muestra la prioridad asignada y actualiza automáticamente el listado.

## Reglas de seguridad
El clasificador contempla situaciones que requieren atención prioritaria, como incidencias que representan peligro para las personas.

## Modelo de IA
Se utiliza llama3.2:1b mediante Ollama, ejecutado localmente.

## Resultado
La plataforma permite registrar incidencias y asignarles una prioridad automática, facilitando su organización y atención.

## Observaciones
La clasificación automática es una recomendación inicial y puede ser revisada por un administrador.
