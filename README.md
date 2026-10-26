# Plataforma Web de Reportes y Gestión de Incidencias

Proyecto final del curso **Desarrollo Web**. Es un sistema para que la ciudadanía reporte problemas de infraestructura y servicios públicos, y para que el personal administrativo los clasifique, priorice, asigne y les dé seguimiento hasta resolverlos.

## Arquitectura

```
Navegador (HTML5, CSS3, JavaScript + Leaflet)
        │
        ├──► Keycloak :8080 (OAuth 2.0 / OpenID Connect → JWT)
        │
        ▼
Nginx :8081 (proxy inverso)
        ├── /api/usuarios/*     ──► API Usuarios y Gestión (Flask) :5001
        └── /api/incidencias/*  ──► API Incidencias (Flask) :5002 ──► Ollama (IA local)
                                              │
                                              ▼
                                   PostgreSQL :5434 (incidencias_db)
```

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| Frontend | HTML5, CSS3, JavaScript, Leaflet + OpenStreetMap | Inicio de sesión, panel ciudadano y panel administrador |
| Autenticación | Keycloak (realm `incidencias`) | OAuth 2.0, emisión de JWT y roles `usuario` / `administrador` |
| Proxy inverso | Nginx | Recibe todas las solicitudes y las dirige al microservicio correspondiente |
| API Usuarios y Gestión | Flask + SQLAlchemy | Usuarios, roles y catálogo de personal |
| API Incidencias | Flask + SQLAlchemy | Incidencias, fotografías, ubicación, seguimiento, historial e IA |
| Base de datos | PostgreSQL | Tablas `usuarios`, `personal`, `incidencias`, `historial_incidencias` |
| Inteligencia artificial | Ollama (`llama3.2:1b`) | Prioridad, categoría sugerida y resumen automático |

## Funcionalidades

**Ciudadano (rol `usuario`)**
- Inicia sesión o crea una cuenta con Keycloak.
- Registra incidencias con título, descripción, categoría (o sugerencia de la IA), **fotografía** y **ubicación en el mapa**.
- Consulta solo **sus** reportes, con una línea de progreso de 6 etapas y el historial de atención.
- Puede **eliminar** un reporte solo mientras siga en «Reporte recibido». En cuanto el administrador lo gestiona, pasa a «En revisión» y ya no puede eliminarse, porque se considera un asunto de interés común.

**Administrador (rol `administrador`)**
- Panel general con indicadores, mapa de incidencias activas, incidencias por categoría y lista de las que requieren atención.
- Tabla de incidencias con búsqueda y filtros por estado, prioridad y categoría.
- Gestión de cada incidencia: prioridad, categoría, responsable, etapa de seguimiento y comentarios.
- Resumen automático con IA, fotografía y ubicación del reporte.
- Catálogo de personal o cuadrillas (registrar, cambiar disponibilidad y eliminar; no se puede eliminar a quien tiene incidencias sin resolver).
- Historial general de cambios.

### Etapas de seguimiento

| Etapa | Estado oficial |
|---|---|
| 1. Reporte recibido | Pendiente |
| 2. En revisión | Pendiente |
| 3. Personal asignado | En proceso |
| 4. Personal en camino | En proceso |
| 5. Trabajo en proceso | En proceso |
| 6. Resuelto | Resuelto |

Cuando el administrador gestiona por primera vez un reporte nuevo, este pasa automáticamente a **En revisión**; si además asigna un responsable, avanza a **Personal asignado**. Cada cambio queda registrado en el historial.

### Categorías

Alumbrado público, Fuga de agua, Calles dañadas, Infraestructura, Incendios y Otros.

## Endpoints

Todos los endpoints protegidos requieren el encabezado `Authorization: Bearer <JWT>` y se consumen a través de Nginx (`http://localhost:8081`).

### API Usuarios y Gestión (puerto 5001)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/usuarios` | administrador | Lista los usuarios |
| POST | `/api/usuarios` | administrador | Crea un usuario |
| POST | `/api/usuarios/mi-perfil` | usuario, administrador | Sincroniza el usuario de Keycloak con PostgreSQL |
| GET | `/api/usuarios/personal` | administrador | Lista el personal (`?activos=1` solo disponibles) |
| POST | `/api/usuarios/personal` | administrador | Registra personal `{nombre, especialidad, telefono}` |
| PATCH | `/api/usuarios/personal/<id>` | administrador | Actualiza nombre, especialidad, teléfono o `activo` |
| DELETE | `/api/usuarios/personal/<id>` | administrador | Elimina personal sin incidencias pendientes (409 si tiene) |

### API Incidencias (puerto 5002)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/incidencias` | usuario, administrador | El ciudadano recibe solo sus incidencias; el administrador, todas |
| POST | `/api/incidencias` | usuario | Crea una incidencia (JSON o `multipart/form-data` con `foto`) |
| GET | `/api/incidencias/<id>` | dueño o administrador | Detalle con historial |
| PATCH | `/api/incidencias/<id>` | administrador | Actualiza `prioridad`, `categoria`, `avance`, `estado`, `personal_id`, `comentario` |
| DELETE | `/api/incidencias/<id>` | dueño (usuario) | Elimina el reporte solo si sigue en «Reporte recibido» (409 si ya está en atención) |
| GET | `/api/incidencias/<id>/foto` | dueño o administrador | Devuelve la fotografía (acceso protegido) |
| GET | `/api/incidencias/<id>/historial` | dueño o administrador | Historial de la incidencia |
| GET | `/api/incidencias/historial` | administrador | Historial general (`?limite=200`) |
| POST | `/api/incidencias/<id>/resumen` | administrador | Genera y guarda un resumen con IA |
| POST | `/api/incidencias/sugerir-categoria` | usuario, administrador | Sugiere la categoría a partir de `{titulo, descripcion}` |
| GET | `/api/incidencias/catalogos` | usuario, administrador | Categorías, estados, prioridades y etapas |

Ejemplo para crear una incidencia con fotografía:

```bash
curl -X POST http://localhost:8081/api/incidencias \
  -H "Authorization: Bearer <JWT>" \
  -F "titulo=Fuga de agua" \
  -F "descripcion=Tubería rota frente a la escuela" \
  -F "latitud=14.5370" -F "longitud=-91.6772" \
  -F "foto=@fuga.jpg"
```

## Seguridad y privacidad

- Todas las APIs validan la firma, emisor, audiencia y expiración del JWT emitido por Keycloak.
- El backend filtra las incidencias por usuario: un ciudadano no puede consultar reportes ni fotografías de otra persona, aunque conozca el ID.
- Las fotografías se guardan en `api-incidencias/uploads/` (fuera del frontend) y solo se entregan con un token válido. Se aceptan JPG, PNG y WEBP de hasta 5 MB.

## Cómo ejecutar el proyecto

1. Contenedores (PostgreSQL, Keycloak y Nginx):
   ```bash
   docker compose up -d
   ```
2. IA local:
   ```bash
   ollama run llama3.2:1b
   ```
3. API Usuarios (en `api-usuarios`, con el entorno virtual activado):
   ```bash
   python app.py
   ```
4. API Incidencias (en `api-incidencias`, con el entorno virtual activado):
   ```bash
   python app.py
   ```
5. Frontend: abrir `frontend/index.html` con **Live Server** (`http://127.0.0.1:5500/frontend/index.html`).

Al iniciar, las APIs crean automáticamente las tablas y columnas nuevas sin borrar los datos existentes, y cargan un catálogo inicial de personal.

## Estructura

```
api-incidencias/   app.py, clasificador_ia.py, seguridad.py, uploads/
api-usuarios/      app.py, seguridad.py
frontend/          index.html, pages/, JS/, CSS/
nginx/             default.conf
docker-compose.yml
```
