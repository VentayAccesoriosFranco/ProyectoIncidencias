-- =============================================================================
-- Plataforma Web de Reportes y Gestión de Incidencias
-- Modelo relacional de la base de datos incidencias_db (PostgreSQL)
--
-- Nota: las tablas las crea automáticamente SQLAlchemy al iniciar cada API
-- (db.create_all()). Este script documenta la misma estructura y permite
-- crearla manualmente si se desea.
--
-- Propietario de cada tabla:
--   API Usuarios y Gestión  -> usuarios, personal
--   API Incidencias         -> incidencias, historial_incidencias
-- =============================================================================


-- -----------------------------------------------------------------------------
-- API USUARIOS Y GESTIÓN
-- -----------------------------------------------------------------------------

-- Usuarios del sistema, sincronizados desde Keycloak al iniciar sesión.
CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL        PRIMARY KEY,
    keycloak_id   VARCHAR(100)  UNIQUE,                       -- "sub" del token JWT
    nombre        VARCHAR(100)  NOT NULL,
    correo        VARCHAR(150)  NOT NULL UNIQUE,
    rol           VARCHAR(30)   NOT NULL DEFAULT 'usuario'    -- usuario | administrador
);

-- Catálogo de trabajadores o cuadrillas que atienden las incidencias.
CREATE TABLE IF NOT EXISTS personal (
    id              SERIAL        PRIMARY KEY,
    nombre          VARCHAR(120)  NOT NULL,
    especialidad    VARCHAR(80)   NOT NULL,                   -- misma lista que las categorías
    telefono        VARCHAR(30),
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    fecha_registro  TIMESTAMP     DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- API INCIDENCIAS
-- -----------------------------------------------------------------------------

-- Reportes registrados por los ciudadanos.
CREATE TABLE IF NOT EXISTS incidencias (
    id                   SERIAL            PRIMARY KEY,
    usuario_id           INTEGER           NOT NULL,          -- referencia lógica a usuarios.id
    titulo               VARCHAR(150)      NOT NULL,
    descripcion          TEXT              NOT NULL,
    categoria            VARCHAR(80)       NOT NULL,          -- Alumbrado público, Fuga de agua, Calles dañadas,
                                                              -- Infraestructura, Incendios, Otros
    categoria_sugerida   VARCHAR(80),                         -- sugerida por la IA
    estado               VARCHAR(30)       NOT NULL DEFAULT 'Pendiente',   -- Pendiente | En proceso | Resuelto
    avance               VARCHAR(40)       DEFAULT 'Reporte recibido',     -- etapa de seguimiento (6 etapas)
    prioridad            VARCHAR(30)       NOT NULL DEFAULT 'Media',       -- Alta | Media | Baja
    latitud              DOUBLE PRECISION,
    longitud             DOUBLE PRECISION,
    foto                 VARCHAR(255),                        -- nombre del archivo en api-incidencias/uploads/
    resumen_ia           TEXT,                                -- resumen generado por la IA
    personal_id          INTEGER,                             -- referencia lógica a personal.id (responsable)
    fecha_creacion       TIMESTAMP         DEFAULT NOW(),
    fecha_actualizacion  TIMESTAMP
);

-- Trazabilidad: cada cambio realizado sobre una incidencia.
CREATE TABLE IF NOT EXISTS historial_incidencias (
    id              SERIAL        PRIMARY KEY,
    incidencia_id   INTEGER       NOT NULL
                    REFERENCES incidencias (id) ON DELETE CASCADE,
    fecha           TIMESTAMP     NOT NULL DEFAULT NOW(),
    usuario         VARCHAR(150)  NOT NULL,                   -- nombre de quien hizo el cambio
    rol             VARCHAR(30),                              -- ciudadano | administrador
    accion          VARCHAR(80)   NOT NULL,                   -- p. ej. "Personal asignado"
    detalle         TEXT
);

CREATE INDEX IF NOT EXISTS ix_historial_incidencias_incidencia_id
    ON historial_incidencias (incidencia_id);


-- -----------------------------------------------------------------------------
-- RELACIONES
-- -----------------------------------------------------------------------------
-- usuarios    1 ──< incidencias            (incidencias.usuario_id  -> usuarios.id)    lógica
-- personal    1 ──< incidencias            (incidencias.personal_id -> personal.id)    lógica, opcional
-- incidencias 1 ──< historial_incidencias  (historial.incidencia_id -> incidencias.id) llave foránea
--
-- Las relaciones entre tablas de microservicios distintos (usuarios/personal con
-- incidencias) se mantienen como referencias lógicas, sin restricción FOREIGN KEY,
-- para que cada microservicio pueda desplegarse y evolucionar de forma
-- independiente. La integridad la validan las APIs:
--   * API Incidencias obtiene usuario_id del usuario autenticado (keycloak_id).
--   * API Incidencias verifica que personal_id exista y esté activo al asignarlo.
--   * API Usuarios no permite eliminar personal con incidencias sin resolver.
-- =============================================================================
